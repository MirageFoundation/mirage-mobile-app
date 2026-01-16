import { useState } from 'react';
import {
  Text,
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import {
  hash,
  hashSync,
  verify,
  computePow,
  cancelPow,
  getPowProgress,
  type HashResult,
  type PowResult,
} from 'react-native-argon2-turbo';

export default function App() {
  const [hashResult, setHashResult] = useState<HashResult | null>(null);
  const [syncHashResult, setSyncHashResult] = useState<HashResult | null>(null);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [powResult, setPowResult] = useState<PowResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [powProgress, setPowProgress] = useState<string>('');

  const testHash = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await hash({
        password: 'mypassword123',
        salt: 'randomsalt16bytes',
        iterations: 2,
        memory: 65536,
        parallelism: 1,
        hashLength: 32,
        mode: 'argon2id',
      });
      setHashResult(result);
    } catch (e) {
      setError(`Hash error: ${e}`);
    }
    setLoading(false);
  };

  const testHashSync = () => {
    setError(null);
    try {
      const result = hashSync({
        password: 'mypassword123',
        salt: 'randomsalt16bytes',
        iterations: 2,
        memory: 65536,
        parallelism: 1,
        hashLength: 32,
        mode: 'argon2id',
      });
      setSyncHashResult(result);
    } catch (e) {
      setError(`HashSync error: ${e}`);
    }
  };

  const testVerify = async () => {
    if (!hashResult) {
      setError('Run hash first');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await verify({
        password: 'mypassword123',
        encodedHash: hashResult.encodedHash,
      });
      setVerifyResult(result);
    } catch (e) {
      setError(`Verify error: ${e}`);
    }
    setLoading(false);
  };

  const testPow = async () => {
    setLoading(true);
    setError(null);
    setPowProgress('Starting PoW...');
    setPowResult(null);

    const progressInterval = setInterval(async () => {
      try {
        const progress = await getPowProgress();
        setPowProgress(
          `Attempts: ${progress.attempts}, ${progress.hashesPerSecond.toFixed(1)} h/s`
        );
      } catch {}
    }, 500);

    try {
      const result = await computePow({
        base: '48656c6c6f', // "Hello" in hex
        salt: 'a'.repeat(64), // 32 bytes of 0xaa
        difficulty: 8, // Find hash with 8 leading zero bits
        startNonce: 0,
        maxAttempts: 1000000,
        timeoutMs: 60000,
        iterations: 1,
        memory: 4096,
        parallelism: 1,
        hashLength: 32,
      });
      setPowResult(result);
      setPowProgress(
        `Found! ${result.attempts} attempts in ${result.elapsedMs.toFixed(0)}ms`
      );
    } catch (e) {
      setError(`PoW error: ${e}`);
      setPowProgress('');
    } finally {
      clearInterval(progressInterval);
      setLoading(false);
    }
  };

  const testCancelPow = () => {
    cancelPow();
    setPowProgress('Cancelled');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>react-native-argon2-turbo</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hash (Async)</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={testHash}
          disabled={loading}
        >
          <Text style={styles.buttonText}>Test hash()</Text>
        </TouchableOpacity>
        {hashResult && (
          <View style={styles.result}>
            <Text style={styles.label}>Raw Hash:</Text>
            <Text style={styles.value} numberOfLines={2}>
              {hashResult.rawHash}
            </Text>
            <Text style={styles.label}>Encoded Hash:</Text>
            <Text style={styles.value} numberOfLines={3}>
              {hashResult.encodedHash}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hash (Sync)</Text>
        <TouchableOpacity style={styles.button} onPress={testHashSync}>
          <Text style={styles.buttonText}>Test hashSync()</Text>
        </TouchableOpacity>
        {syncHashResult && (
          <View style={styles.result}>
            <Text style={styles.label}>Raw Hash:</Text>
            <Text style={styles.value} numberOfLines={2}>
              {syncHashResult.rawHash}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Verify</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={testVerify}
          disabled={loading || !hashResult}
        >
          <Text style={styles.buttonText}>Test verify()</Text>
        </TouchableOpacity>
        {verifyResult !== null && (
          <View style={styles.result}>
            <Text style={styles.label}>Valid:</Text>
            <Text style={[styles.value, { color: verifyResult ? 'green' : 'red' }]}>
              {verifyResult ? 'YES ✓' : 'NO ✗'}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Proof of Work</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, styles.powButton]}
            onPress={testPow}
            disabled={loading}
          >
            <Text style={styles.buttonText}>Test computePow()</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.cancelButton]}
            onPress={testCancelPow}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        {powProgress && <Text style={styles.progress}>{powProgress}</Text>}
        {powResult && (
          <View style={styles.result}>
            <Text style={styles.label}>Nonce:</Text>
            <Text style={styles.value}>{powResult.nonce}</Text>
            <Text style={styles.label}>Digest:</Text>
            <Text style={styles.value} numberOfLines={2}>
              {powResult.digest}
            </Text>
            <Text style={styles.label}>Attempts:</Text>
            <Text style={styles.value}>{powResult.attempts}</Text>
            <Text style={styles.label}>Time:</Text>
            <Text style={styles.value}>{powResult.elapsedMs.toFixed(0)}ms</Text>
          </View>
        )}
      </View>

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 60,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  section: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  powButton: {
    flex: 1,
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    flex: 0.5,
  },
  result: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 4,
  },
  value: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#333',
    marginBottom: 8,
  },
  error: {
    backgroundColor: '#FFE5E5',
    color: '#D00',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    textAlign: 'center',
  },
  progress: {
    marginTop: 8,
    textAlign: 'center',
    color: '#666',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
