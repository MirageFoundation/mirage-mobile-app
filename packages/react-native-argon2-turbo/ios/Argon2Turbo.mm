#import "Argon2Turbo.h"
#import <React/RCTConvert.h>
#import <atomic>
#import <chrono>

#if __has_include(<react_native_argon2_turbo/react_native_argon2_turbo-Swift.h>)
#import <react_native_argon2_turbo/react_native_argon2_turbo-Swift.h>
#elif __has_include("react_native_argon2_turbo-Swift.h")
#import "react_native_argon2_turbo-Swift.h"
#elif __has_include("Argon2Turbo-Swift.h")
#import "Argon2Turbo-Swift.h"
#else
@class Argon2Core;
@class Argon2HashResult;
#endif

@implementation Argon2Turbo {
    std::atomic<bool> _cancelFlag;
    std::atomic<int> _currentAttempts;
    std::chrono::steady_clock::time_point _powStartTime;
}

- (instancetype)init {
    if (self = [super init]) {
        _cancelFlag.store(false);
        _currentAttempts.store(0);
    }
    return self;
}

+ (NSString *)moduleName {
    return @"Argon2Turbo";
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params {
    return std::make_shared<facebook::react::NativeArgon2TurboSpecJSI>(params);
}

#pragma mark - Hashing

- (void)hash:(NSString *)password
        salt:(NSString *)salt
  iterations:(double)iterations
      memory:(double)memory
 parallelism:(double)parallelism
  hashLength:(double)hashLength
        mode:(NSString *)mode
passwordEncoding:(NSString *)passwordEncoding
saltEncoding:(NSString *)saltEncoding
     resolve:(RCTPromiseResolveBlock)resolve
      reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            NSDictionary *result = [self performHash:password
                                                salt:salt
                                          iterations:(int)iterations
                                              memory:(int)memory
                                         parallelism:(int)parallelism
                                          hashLength:(int)hashLength
                                                mode:mode];
            dispatch_async(dispatch_get_main_queue(), ^{
                resolve(result);
            });
        } @catch (NSException *exception) {
            dispatch_async(dispatch_get_main_queue(), ^{
                reject(@"HASH_ERROR", exception.reason, nil);
            });
        }
    });
}

- (NSDictionary *)hashSync:(NSString *)password
                      salt:(NSString *)salt
                iterations:(double)iterations
                    memory:(double)memory
               parallelism:(double)parallelism
                hashLength:(double)hashLength
                      mode:(NSString *)mode
          passwordEncoding:(NSString *)passwordEncoding
              saltEncoding:(NSString *)saltEncoding {
    return [self performHash:password
                        salt:salt
                  iterations:(int)iterations
                      memory:(int)memory
                 parallelism:(int)parallelism
                  hashLength:(int)hashLength
                        mode:mode];
}

- (NSDictionary *)performHash:(NSString *)password
                         salt:(NSString *)salt
                   iterations:(int)iterations
                       memory:(int)memory
                  parallelism:(int)parallelism
                   hashLength:(int)hashLength
                         mode:(NSString *)mode {
    NSError *error = nil;
    
    Argon2TypeObjC type = Argon2TypeObjCId;
    if ([mode isEqualToString:@"argon2i"]) {
        type = Argon2TypeObjCI;
    } else if ([mode isEqualToString:@"argon2d"]) {
        type = Argon2TypeObjCD;
    }
    
    Argon2HashResult *result = [Argon2Core hashStringWithPassword:password
                                                             salt:salt
                                                       iterations:iterations
                                                           memory:memory
                                                      parallelism:parallelism
                                                       hashLength:hashLength
                                                             type:type
                                                            error:&error];
    
    if (error || result == nil) {
        @throw [NSException exceptionWithName:@"Argon2Error"
                                       reason:error.localizedDescription ?: @"Hash computation failed"
                                     userInfo:nil];
    }
    
    return @{
        @"rawHash": result.rawHashHex,
        @"encodedHash": result.encodedHash
    };
}

- (void)verify:(NSString *)password
   encodedHash:(NSString *)encodedHash
       resolve:(RCTPromiseResolveBlock)resolve
        reject:(RCTPromiseRejectBlock)reject {
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            BOOL isValid = [Argon2Core verifyWithPassword:password encodedHash:encodedHash];
            dispatch_async(dispatch_get_main_queue(), ^{
                resolve(@(isValid));
            });
        } @catch (NSException *exception) {
            dispatch_async(dispatch_get_main_queue(), ^{
                reject(@"VERIFY_ERROR", exception.reason, nil);
            });
        }
    });
}

#pragma mark - Proof of Work

- (void)computePow:(NSString *)base
              salt:(NSString *)salt
        difficulty:(double)difficulty
        startNonce:(double)startNonce
       maxAttempts:(double)maxAttempts
         timeoutMs:(double)timeoutMs
        iterations:(double)iterations
            memory:(double)memory
       parallelism:(double)parallelism
        hashLength:(double)hashLength
           resolve:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject {
    
    _cancelFlag.store(false);
    _currentAttempts.store(0);
    _powStartTime = std::chrono::steady_clock::now();
    
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            uint32_t nonce = (uint32_t)startNonce;
            int attempts = 0;
            int maxAttemptCount = (int)maxAttempts;
            int requiredBits = (int)difficulty;
            
            NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:timeoutMs / 1000.0];
            
            NSData *baseData = [self hexToData:base];
            NSData *saltData = [self hexToData:salt];
            NSData *colonData = [@":" dataUsingEncoding:NSUTF8StringEncoding];
            
            while (attempts < maxAttemptCount && !self->_cancelFlag.load()) {
                if ([[NSDate date] compare:deadline] == NSOrderedDescending) {
                    dispatch_async(dispatch_get_main_queue(), ^{
                        reject(@"POW_TIMEOUT", @"PoW computation timed out", nil);
                    });
                    return;
                }
                
                NSMutableData *password = [NSMutableData dataWithData:baseData];
                [password appendData:colonData];
                [password appendData:[self uvarintEncode:nonce]];
                
                NSData *digest = [Argon2Core computeArgon2BytesWithPassword:password
                                                                       salt:saltData
                                                                 iterations:(int)iterations
                                                                     memory:(int)memory
                                                                parallelism:(int)parallelism
                                                                 hashLength:(int)hashLength];
                
                if (digest == nil) {
                    digest = [NSMutableData dataWithLength:(int)hashLength];
                }
                
                attempts++;
                self->_currentAttempts.store(attempts);
                
                int leadingZeros = [self countLeadingZeroBits:digest];
                if (leadingZeros >= requiredBits) {
                    auto elapsed = std::chrono::steady_clock::now() - self->_powStartTime;
                    double elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();
                    
                    NSDictionary *result = @{
                        @"nonce": @(nonce),
                        @"digest": [self dataToHex:digest],
                        @"attempts": @(attempts),
                        @"elapsedMs": @(elapsedMs)
                    };
                    
                    dispatch_async(dispatch_get_main_queue(), ^{
                        resolve(result);
                    });
                    return;
                }
                
                nonce++;
            }
            
            if (self->_cancelFlag.load()) {
                dispatch_async(dispatch_get_main_queue(), ^{
                    reject(@"POW_CANCELLED", @"PoW computation was cancelled", nil);
                });
            } else {
                dispatch_async(dispatch_get_main_queue(), ^{
                    reject(@"POW_MAX_ATTEMPTS", @"Max attempts exceeded", nil);
                });
            }
        } @catch (NSException *exception) {
            dispatch_async(dispatch_get_main_queue(), ^{
                reject(@"POW_ERROR", exception.reason, nil);
            });
        }
    });
}

- (void)cancelPow {
    _cancelFlag.store(true);
}

- (void)getPowProgress:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject {
    int attempts = _currentAttempts.load();
    auto elapsed = std::chrono::steady_clock::now() - _powStartTime;
    double elapsedMs = std::chrono::duration_cast<std::chrono::milliseconds>(elapsed).count();
    double hashesPerSecond = elapsedMs > 0 ? (attempts / (elapsedMs / 1000.0)) : 0;
    
    resolve(@{
        @"attempts": @(attempts),
        @"elapsedMs": @(elapsedMs),
        @"hashesPerSecond": @(hashesPerSecond)
    });
}

#pragma mark - Helper Methods

- (int)countLeadingZeroBits:(NSData *)data {
    const uint8_t *bytes = (const uint8_t *)data.bytes;
    int count = 0;
    
    for (NSUInteger i = 0; i < data.length; i++) {
        uint8_t byte = bytes[i];
        if (byte == 0) {
            count += 8;
        } else {
            uint8_t mask = 0x80;
            while (mask != 0 && (byte & mask) == 0) {
                count++;
                mask >>= 1;
            }
            break;
        }
    }
    
    return count;
}

- (NSData *)uvarintEncode:(uint32_t)value {
    NSMutableData *result = [NSMutableData data];
    
    while (value >= 0x80) {
        uint8_t byte = (value & 0x7F) | 0x80;
        [result appendBytes:&byte length:1];
        value >>= 7;
    }
    
    uint8_t byte = (uint8_t)value;
    [result appendBytes:&byte length:1];
    
    return result;
}

- (NSData *)hexToData:(NSString *)hex {
    NSMutableData *data = [NSMutableData data];
    for (int i = 0; i + 1 < hex.length; i += 2) {
        NSString *byteStr = [hex substringWithRange:NSMakeRange(i, 2)];
        unsigned int byte;
        [[NSScanner scannerWithString:byteStr] scanHexInt:&byte];
        uint8_t b = (uint8_t)byte;
        [data appendBytes:&b length:1];
    }
    return data;
}

- (NSString *)dataToHex:(NSData *)data {
    const uint8_t *bytes = (const uint8_t *)data.bytes;
    NSMutableString *hex = [NSMutableString stringWithCapacity:data.length * 2];
    for (NSUInteger i = 0; i < data.length; i++) {
        [hex appendFormat:@"%02x", bytes[i]];
    }
    return hex;
}

@end
