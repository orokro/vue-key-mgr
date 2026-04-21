import { shallowRef, watchEffect, triggerRef } from 'vue';

export class KeyManager {
    constructor(options = {}) {
        this.ignoreList = options.ignoreList || ['input', 'textarea'];
        this.schema = shallowRef(null);
        this.activeKeyMap = new Map();
        this.activeKeys = shallowRef([]); // Reactive list of currently active actions
        this.listeners = new Map(); // path -> Set of callbacks
        this.isListening = false;
        this._onKeyDown = this._onKeyDown.bind(this);
    }

    init(schema) {
        this.schema.value = schema;
        this.bindEvents();
        
        // Start tracking reactive schema changes to update flattened map
        watchEffect(() => {
            this._updateActiveKeyMap();
        });
    }

    /**
     * Procedural way to get currently active keys/actions
     */
    getActiveKeys() {
        return this.activeKeys.value;
    }

    /**
     * Exports the current key bindings and metadata (descriptions)
     * as a serializable object.
     */
    getBindings() {
        const bindings = {};
        if (!this.schema.value) return bindings;

        const traverse = (category, parentPath = '') => {
            const categoryPath = parentPath ? `${parentPath}.${category.name}` : category.name;
            
            if (category.actions) {
                category.actions.forEach(action => {
                    const actionPath = `${categoryPath}.${action.name}`;
                    bindings[actionPath] = {
                        key: action.key,
                        modifiers: action.modifiers || [],
                        desc: action.desc || ''
                    };
                });
            }

            if (category.categories) {
                category.categories.forEach(subCat => traverse(subCat, categoryPath));
            }
        };

        this.schema.value.categories?.forEach(cat => traverse(cat));
        return bindings;
    }

    /**
     * Hydrates the schema with saved bindings. 
     * Matches by action path.
     */
    applyBindings(bindings) {
        if (!this.schema.value || !bindings) return;

        const traverse = (category, parentPath = '') => {
            const categoryPath = parentPath ? `${parentPath}.${category.name}` : category.name;
            
            if (category.actions) {
                category.actions.forEach(action => {
                    const actionPath = `${categoryPath}.${action.name}`;
                    if (bindings[actionPath]) {
                        action.key = bindings[actionPath].key;
                        action.modifiers = bindings[actionPath].modifiers;
                    }
                });
            }

            if (category.categories) {
                category.categories.forEach(subCat => traverse(subCat, categoryPath));
            }
        };

        this.schema.value.categories?.forEach(cat => traverse(cat));
        // Force a re-run of the update effect since we mutated action objects
        triggerRef(this.schema);
    }

    setIgnoreList(list) {
        this.ignoreList = list;
    }

    bindEvents() {
        if (!this.isListening) {
            window.addEventListener('keydown', this._onKeyDown, { capture: true });
            this.isListening = true;
        }
    }

    unbindEvents() {
        if (this.isListening) {
            window.removeEventListener('keydown', this._onKeyDown, { capture: true });
            this.isListening = false;
        }
    }

    on(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);
    }

    off(path, callback) {
        const pathListeners = this.listeners.get(path);
        if (pathListeners) {
            pathListeners.delete(callback);
            if (pathListeners.size === 0) {
                this.listeners.delete(path);
            }
        }
    }

    _updateActiveKeyMap() {
        const newMap = new Map();
        const activeList = [];
        if (!this.schema.value) return;

        const processCategory = (category, parentPath = '', parentEnabled = true) => {
            const isEnabled = parentEnabled && (category.enabled === undefined || 
                (typeof category.enabled === 'boolean' ? category.enabled : category.enabled.value));
            
            const categoryPath = parentPath ? `${parentPath}.${category.name}` : category.name;

            if (category.actions) {
                category.actions.forEach(action => {
                    if (isEnabled) {
                        const actionPath = `${categoryPath}.${action.name}`;
                        const keyCombo = this._getKeyComboString(action);
                        const entry = {
                            action,
                            path: actionPath,
                            categoryPath,
                            combo: keyCombo
                        };
                        // Last one wins / deeper wins (overwrites earlier entries)
                        newMap.set(keyCombo, entry);
                        activeList.push(entry);
                    }
                });
            }

            if (category.categories) {
                category.categories.forEach(subCat => {
                    processCategory(subCat, categoryPath, isEnabled);
                });
            }
        };

        this.schema.value.categories?.forEach(cat => processCategory(cat));
        this.activeKeyMap = newMap;
        this.activeKeys.value = activeList;
    }

    _getKeyComboString(action) {
        const mods = (action.modifiers || [])
            .map(m => m.toLowerCase())
            .sort()
            .join('+');
        const key = action.key.toLowerCase();
        return mods ? `${mods}+${key}` : key;
    }

    _getEventKeyComboString(event) {
        const mods = [];
        if (event.ctrlKey) mods.push('ctrl');
        if (event.altKey) mods.push('alt');
        if (event.shiftKey) mods.push('shift');
        if (event.metaKey) mods.push('meta');
        
        const key = event.key.toLowerCase();
        // Don't include modifiers alone as the key
        if (['control', 'alt', 'shift', 'meta'].includes(key)) return null;
        
        const modsStr = mods.sort().join('+');
        return modsStr ? `${modsStr}+${key}` : key;
    }

    _onKeyDown(event) {
        // Check ignore list
        const path = event.composedPath();
        const isIgnored = path.some(el => {
            if (!el.matches) return false;
            return this.ignoreList.some(selector => el.matches(selector));
        });

        if (isIgnored) return;

        const combo = this._getEventKeyComboString(event);
        if (!combo) return;

        const activeAction = this.activeKeyMap.get(combo);
        if (activeAction) {
            if (activeAction.action.allowDefault !== true) {
                event.preventDefault();
            }

            let propagationStopped = false;
            const stopPropagation = () => {
                propagationStopped = true;
            };

            const trigger = (path, actionObj) => {
                const callbacks = this.listeners.get(path);
                if (callbacks) {
                    callbacks.forEach(cb => cb(event, actionObj, { stopPropagation }));
                }
            };

            // 1. Trigger action specific listeners
            trigger(activeAction.path, activeAction.action);

            // 2. Trigger category listeners (bubbles up)
            if (!propagationStopped) {
                const parts = activeAction.path.split('.');
                // Remove the action name to get categories
                parts.pop(); 
                
                // Bubble up: a.b.c -> trigger a.b.c, then a.b, then a
                while (parts.length > 0 && !propagationStopped) {
                    const currentPath = parts.join('.');
                    trigger(currentPath, activeAction.action);
                    parts.pop();
                }
            }
        }
    }
}
