import { onMounted, onUnmounted } from 'vue';
import { KeyManager } from './KeyManager.js';

// Singleton instance
const instance = new KeyManager();

export function useKeyManager() {
    const initKeyMgr = (schema) => instance.init(schema);
    const getBindings = () => instance.getBindings();
    const applyBindings = (bindings) => instance.applyBindings(bindings);
    const registerProvider = (type, factory) => instance.registerProvider(type, factory);

    return {
        keyMgr: instance,
        initKeyMgr,
        getBindings,
        applyBindings,
        registerProvider,
        activeKeys: instance.activeKeys
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
