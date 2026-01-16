import Foundation
import Argon2Swift

@objc public enum Argon2TypeObjC: Int {
    case i = 0
    case d = 1
    case id = 2
}

@objc public class Argon2HashResult: NSObject {
    @objc public let rawHash: Data
    @objc public let rawHashHex: String
    @objc public let encodedHash: String
    
    init(rawHash: Data, encodedHash: String) {
        self.rawHash = rawHash
        self.rawHashHex = rawHash.map { String(format: "%02x", $0) }.joined()
        self.encodedHash = encodedHash
    }
}

@objc public class Argon2Core: NSObject {
    
    @objc public static func hashString(
        password: String,
        salt: String,
        iterations: Int,
        memory: Int,
        parallelism: Int,
        hashLength: Int,
        type: Argon2TypeObjC
    ) throws -> Argon2HashResult {
        let argon2Type: Argon2Type
        switch type {
        case .i:
            argon2Type = .i
        case .d:
            argon2Type = .d
        case .id:
            argon2Type = .id
        @unknown default:
            argon2Type = .id
        }
        
        guard let saltData = salt.data(using: .utf8) else {
            throw NSError(domain: "Argon2Core", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid salt encoding"])
        }
        
        let saltObj = Salt(bytes: saltData)
        
        let result = try Argon2Swift.hashPasswordString(
            password: password,
            salt: saltObj,
            iterations: iterations,
            memory: memory,
            parallelism: parallelism,
            length: hashLength,
            type: argon2Type
        )
        
        return Argon2HashResult(
            rawHash: result.hashData(),
            encodedHash: result.encodedString()
        )
    }
    
    @objc public static func verify(
        password: String,
        encodedHash: String
    ) -> Bool {
        do {
            return try Argon2Swift.verifyHashString(
                password: password,
                hash: encodedHash
            )
        } catch {
            return false
        }
    }
    
    @objc public static func computeArgon2Bytes(
        password: Data,
        salt: Data,
        iterations: Int,
        memory: Int,
        parallelism: Int,
        hashLength: Int
    ) -> Data? {
        do {
            let saltObj = Salt(bytes: salt)
            
            let result = try Argon2Swift.hashPasswordBytes(
                password: password,
                salt: saltObj,
                iterations: iterations,
                memory: memory,
                parallelism: parallelism,
                length: hashLength,
                type: .id
            )
            return result.hashData()
        } catch {
            return nil
        }
    }
}
