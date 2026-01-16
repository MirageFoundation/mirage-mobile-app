package com.argon2turbo

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.WritableMap
import com.facebook.react.module.annotations.ReactModule
import com.lambdapioneer.argon2kt.Argon2Kt
import com.lambdapioneer.argon2kt.Argon2Mode
import com.lambdapioneer.argon2kt.Argon2KtResult
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

@ReactModule(name = Argon2TurboModule.NAME)
class Argon2TurboModule(reactContext: ReactApplicationContext) :
    NativeArgon2TurboSpec(reactContext) {

    private val argon2Kt = Argon2Kt()
    private val cancelFlag = AtomicBoolean(false)
    private val currentAttempts = AtomicInteger(0)
    private var powStartTime: Long = 0
    private var powJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)

    override fun getName(): String = NAME

    override fun hash(
        password: String,
        salt: String,
        iterations: Double,
        memory: Double,
        parallelism: Double,
        hashLength: Double,
        mode: String,
        passwordEncoding: String,
        saltEncoding: String,
        promise: Promise
    ) {
        scope.launch {
            try {
                val result = performHash(
                    password.toByteArray(Charsets.UTF_8),
                    salt.toByteArray(Charsets.UTF_8),
                    iterations.toInt(),
                    memory.toInt(),
                    parallelism.toInt(),
                    hashLength.toInt(),
                    mode
                )
                withContext(Dispatchers.Main) {
                    promise.resolve(result)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("HASH_ERROR", e.message)
                }
            }
        }
    }

    override fun hashSync(
        password: String,
        salt: String,
        iterations: Double,
        memory: Double,
        parallelism: Double,
        hashLength: Double,
        mode: String,
        passwordEncoding: String,
        saltEncoding: String
    ): WritableMap {
        return performHash(
            password.toByteArray(Charsets.UTF_8),
            salt.toByteArray(Charsets.UTF_8),
            iterations.toInt(),
            memory.toInt(),
            parallelism.toInt(),
            hashLength.toInt(),
            mode
        )
    }

    private fun performHash(
        password: ByteArray,
        salt: ByteArray,
        iterations: Int,
        memory: Int,
        parallelism: Int,
        hashLength: Int,
        mode: String
    ): WritableMap {
        val argon2Mode = when (mode) {
            "argon2i" -> Argon2Mode.ARGON2_I
            "argon2d" -> Argon2Mode.ARGON2_D
            else -> Argon2Mode.ARGON2_ID
        }

        val result: Argon2KtResult = argon2Kt.hash(
            mode = argon2Mode,
            password = password,
            salt = salt,
            tCostInIterations = iterations,
            mCostInKibibyte = memory,
            parallelism = parallelism,
            hashLengthInBytes = hashLength
        )

        val rawHashHex = result.rawHashAsHexadecimal(lowercase = true)
        val encodedHash = result.encodedOutputAsString()

        return Arguments.createMap().apply {
            putString("rawHash", rawHashHex)
            putString("encodedHash", encodedHash)
        }
    }

    override fun verify(password: String, encodedHash: String, promise: Promise) {
        scope.launch {
            try {
                val isValid = argon2Kt.verify(
                    mode = Argon2Mode.ARGON2_ID,
                    encoded = encodedHash,
                    password = password.toByteArray(Charsets.UTF_8)
                )
                withContext(Dispatchers.Main) {
                    promise.resolve(isValid)
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("VERIFY_ERROR", e.message)
                }
            }
        }
    }

    override fun computePow(
        base: String,
        salt: String,
        difficulty: Double,
        startNonce: Double,
        maxAttempts: Double,
        timeoutMs: Double,
        iterations: Double,
        memory: Double,
        parallelism: Double,
        hashLength: Double,
        promise: Promise
    ) {
        cancelFlag.set(false)
        currentAttempts.set(0)
        powStartTime = System.currentTimeMillis()

        powJob = scope.launch {
            try {
                var nonce = startNonce.toLong().toUInt()
                var attempts = 0
                val maxAttemptCount = maxAttempts.toInt()
                val requiredBits = difficulty.toInt()
                val deadline = System.currentTimeMillis() + timeoutMs.toLong()

                val baseBytes = hexToBytes(base)
                val saltBytes = hexToBytes(salt)
                val colonBytes = ":".toByteArray(Charsets.UTF_8)

                while (attempts < maxAttemptCount && !cancelFlag.get()) {
                    if (System.currentTimeMillis() > deadline) {
                        withContext(Dispatchers.Main) {
                            promise.reject("POW_TIMEOUT", "PoW computation timed out")
                        }
                        return@launch
                    }

                    val password = baseBytes + colonBytes + uvarintEncode(nonce)

                    val result = argon2Kt.hash(
                        mode = Argon2Mode.ARGON2_ID,
                        password = password,
                        salt = saltBytes,
                        tCostInIterations = iterations.toInt(),
                        mCostInKibibyte = memory.toInt(),
                        parallelism = parallelism.toInt(),
                        hashLengthInBytes = hashLength.toInt()
                    )

                    val digest = result.rawHashAsByteArray()

                    attempts++
                    currentAttempts.set(attempts)

                    val leadingZeros = countLeadingZeroBits(digest)
                    if (leadingZeros >= requiredBits) {
                        val elapsedMs = System.currentTimeMillis() - powStartTime

                        withContext(Dispatchers.Main) {
                            promise.resolve(Arguments.createMap().apply {
                                putInt("nonce", nonce.toInt())
                                putString("digest", bytesToHex(digest))
                                putInt("attempts", attempts)
                                putDouble("elapsedMs", elapsedMs.toDouble())
                            })
                        }
                        return@launch
                    }

                    nonce++
                }

                withContext(Dispatchers.Main) {
                    if (cancelFlag.get()) {
                        promise.reject("POW_CANCELLED", "PoW computation was cancelled")
                    } else {
                        promise.reject("POW_MAX_ATTEMPTS", "Max attempts exceeded")
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("POW_ERROR", e.message)
                }
            }
        }
    }

    override fun cancelPow() {
        cancelFlag.set(true)
        powJob?.cancel()
    }

    override fun getPowProgress(promise: Promise) {
        val attempts = currentAttempts.get()
        val elapsedMs = System.currentTimeMillis() - powStartTime
        val hashesPerSecond = if (elapsedMs > 0) {
            attempts.toDouble() / (elapsedMs.toDouble() / 1000.0)
        } else {
            0.0
        }

        promise.resolve(Arguments.createMap().apply {
            putInt("attempts", attempts)
            putDouble("elapsedMs", elapsedMs.toDouble())
            putDouble("hashesPerSecond", hashesPerSecond)
        })
    }

    private fun countLeadingZeroBits(data: ByteArray): Int {
        var count = 0
        for (byte in data) {
            val b = byte.toInt() and 0xFF
            if (b == 0) {
                count += 8
            } else {
                var mask = 0x80
                while (mask != 0 && (b and mask) == 0) {
                    count++
                    mask = mask shr 1
                }
                break
            }
        }
        return count
    }

    private fun uvarintEncode(value: UInt): ByteArray {
        val result = mutableListOf<Byte>()
        var v = value

        while (v >= 0x80u) {
            result.add(((v.toInt() and 0x7F) or 0x80).toByte())
            v = v shr 7
        }
        result.add(v.toByte())

        return result.toByteArray()
    }

    private fun hexToBytes(hex: String): ByteArray {
        val cleanHex = hex.removePrefix("0x")
        val result = ByteArray(cleanHex.length / 2)
        for (i in result.indices) {
            result[i] = cleanHex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
        return result
    }

    private fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02x".format(it) }
    }

    companion object {
        const val NAME = "Argon2Turbo"
    }
}
