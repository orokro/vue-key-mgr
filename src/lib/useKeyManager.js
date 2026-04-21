import { onMounted, onUnmounted } from 'vue';
import { KeyManager } from './KeyManager.js';

// Singleton instance
const instance = new KeyManager();

export function useKeyManager() {
    const initKeyMgr = (schema) => instance.init(schema);

    return {
        keyMgr: instance,
        initKeyMgr
    };
}

export function useKeyAction(path, callback) {
    onMounted(() => {
        instance.on(path, callback);
    });

    onUnmounted(() => {
        instance.off(path, callback);
    });
}
