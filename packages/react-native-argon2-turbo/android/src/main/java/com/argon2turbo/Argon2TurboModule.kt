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
import kotlinx.coroutines.async
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.cancelChildren
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

data class PowWorkerResult(
    val nonce: UInt,
    val digest: String,
    val attempts: Int,
    val workerIndex: Int
)

@ReactModule(name = Argon2TurboModule.NAME)
class Argon2TurboModule(reactContext: ReactApplicationContext) :
    NativeArgon2TurboSpec(reactContext) {

    private val cancelFlag = AtomicBoolean(false)
    private val totalAttempts = AtomicInteger(0)
    private var powStartTime: Long = 0
    private var powJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.Default)
    
    // Store worker attempts for real-time progress tracking
    @Volatile
    private var workerAttemptsArray: Array<AtomicInteger>? = null
    
    // Number of parallel workers for PoW
    private val NUM_WORKERS = 4

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
                val argon2Kt = Argon2Kt()
                val result = performHash(
                    argon2Kt,
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
        val argon2Kt = Argon2Kt()
        return performHash(
            argon2Kt,
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
        argon2Kt: Argon2Kt,
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
                val argon2Kt = Argon2Kt()
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
        totalAttempts.set(0)
        powStartTime = System.currentTimeMillis()

        val requiredBits = difficulty.toInt()
        val maxAttemptsInt = maxAttempts.toInt()
        val timeoutMsLong = timeoutMs.toLong()
        val iterationsInt = iterations.toInt()
        val memoryInt = memory.toInt()
        val parallelismInt = parallelism.toInt()
        val hashLengthInt = hashLength.toInt()

        // Distribute nonce space across workers
        val nonceSpacing = (0xFFFFFFFFL / NUM_WORKERS).toUInt()
        val attemptsPerWorker = maxAttemptsInt / NUM_WORKERS

        powJob = scope.launch {
            try {
                // Create atomic flags for each worker to track completion
                val workerAttempts = Array(NUM_WORKERS) { AtomicInteger(0) }
                
                // Store for real-time progress tracking
                workerAttemptsArray = workerAttempts
                
                // Launch parallel workers
                val workers: List<Deferred<PowWorkerResult?>> = (0 until NUM_WORKERS).map { workerIndex ->
                    async(Dispatchers.Default) {
                        // Each worker gets its own Argon2Kt instance for thread safety
                        val workerArgon2 = Argon2Kt()
                        val workerStartNonce = (workerIndex.toUInt() * nonceSpacing + 
                            (Math.random() * nonceSpacing.toLong()).toUInt())
                        
                        computePowWorker(
                            workerArgon2,
                            base,
                            salt,
                            requiredBits,
                            workerStartNonce,
                            attemptsPerWorker,
                            timeoutMsLong,
                            iterationsInt,
                            memoryInt,
                            parallelismInt,
                            hashLengthInt,
                            cancelFlag,
                            workerAttempts[workerIndex],
                            workerIndex
                        )
                    }
                }

                // Wait for first successful result using select
                var result: PowWorkerResult? = null
                
                while (result == null && workers.any { !it.isCompleted }) {
                    result = select {
                        workers.filter { !it.isCompleted }.forEach { worker ->
                            worker.onAwait { workerResult ->
                                if (workerResult != null) {
                                    // Found a result, cancel other workers
                                    cancelFlag.set(true)
                                    workerResult
                                } else {
                                    null
                                }
                            }
                        }
                    }
                    
                    // Update total attempts
                    val total = workerAttempts.sumOf { it.get() }
                    totalAttempts.set(total)
                }

                // Cancel remaining workers
                cancelFlag.set(true)
                coroutineContext.cancelChildren()

                val elapsedMs = System.currentTimeMillis() - powStartTime
                val finalAttempts = workerAttempts.sumOf { it.get() }
                totalAttempts.set(finalAttempts)

                if (result != null) {
                    withContext(Dispatchers.Main) {
                        promise.resolve(Arguments.createMap().apply {
                            putInt("nonce", result.nonce.toInt())
                            putString("digest", result.digest)
                            putInt("attempts", finalAttempts)
                            putDouble("elapsedMs", elapsedMs.toDouble())
                        })
                    }
                } else {
                    withContext(Dispatchers.Main) {
                        if (cancelFlag.get()) {
                            promise.reject("POW_CANCELLED", "PoW computation was cancelled")
                        } else {
                            promise.reject("POW_MAX_ATTEMPTS", "Max attempts exceeded")
                        }
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    promise.reject("POW_ERROR", e.message)
                }
            }
        }
    }

    private fun computePowWorker(
        argon2Kt: Argon2Kt,
        base: String,
        salt: String,
        requiredBits: Int,
        startNonce: UInt,
        maxAttempts: Int,
        timeoutMs: Long,
        iterations: Int,
        memory: Int,
        parallelism: Int,
        hashLength: Int,
        cancelFlag: AtomicBoolean,
        attemptsCounter: AtomicInteger,
        workerIndex: Int
    ): PowWorkerResult? {
        var nonce = startNonce
        var attempts = 0
        val deadline = System.currentTimeMillis() + timeoutMs

        val baseBytes = hexToBytes(base)
        val saltBytes = hexToBytes(salt)
        val colonBytes = ":".toByteArray(Charsets.UTF_8)

        while (attempts < maxAttempts && !cancelFlag.get()) {
            if (System.currentTimeMillis() > deadline) {
                return null
            }

            val password = baseBytes + colonBytes + uvarintEncode(nonce)

            val result = argon2Kt.hash(
                mode = Argon2Mode.ARGON2_ID,
                password = password,
                salt = saltBytes,
                tCostInIterations = iterations,
                mCostInKibibyte = memory,
                parallelism = parallelism,
                hashLengthInBytes = hashLength
            )

            val digest = result.rawHashAsByteArray()

            attempts++
            attemptsCounter.set(attempts)

            val leadingZeros = countLeadingZeroBits(digest)
            if (leadingZeros >= requiredBits) {
                return PowWorkerResult(nonce, bytesToHex(digest), attempts, workerIndex)
            }

            nonce++
        }

        return null
    }

    override fun cancelPow() {
        cancelFlag.set(true)
        powJob?.cancel()
    }

    override fun getPowProgress(promise: Promise) {
        // Sum up attempts from all workers for real-time progress
        val attempts = workerAttemptsArray?.sumOf { it.get() } ?: totalAttempts.get()
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
