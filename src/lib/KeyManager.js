import { shallowRef, watchEffect, triggerRef } from 'vue';

export class KeyManager {
    constructor(options = {}) {
        this.ignoreList = options.ignoreList || ['input', 'textarea'];
        this.schema = shallowRef(null);
        this.activeInputMap = new Map(); // Map<type, Map<slug, actionEntry>>
        this.activeKeys = shallowRef([]); // Reactive list of currently active actions/combos
        this.listeners = new Map(); // path -> Set of callbacks
        this.isListening = false;
        this.providers = new Map();
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
     * Registers a custom input provider (e.g. gamepad, midi).
     * The factory receives an emit(slug, event) function.
     */
    registerProvider(type, factory) {
        const emit = (slug, event = {}) => {
            this._triggerInput(type, slug, event);
        };
        this.providers.set(type, factory(emit));
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
                    const entry = { desc: action.desc || '' };
                    
                    if (action.inputs) {
                        entry.inputs = JSON.parse(JSON.stringify(action.inputs));
                    } else if (action.keys) {
                        entry.keys = JSON.parse(JSON.stringify(action.keys));
                    } else {
                        entry.key = action.key;
                        entry.modifiers = action.modifiers || [];
                    }
                    
                    bindings[actionPath] = entry;
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
                    const saved = bindings[actionPath];
                    if (saved) {
                        if (saved.inputs) {
                            action.inputs = JSON.parse(JSON.stringify(saved.inputs));
                            delete action.keys;
                            delete action.key;
                            delete action.modifiers;
                        } else if (saved.keys) {
                            action.keys = JSON.parse(JSON.stringify(saved.keys));
                            delete action.inputs;
                            delete action.key;
                            delete action.modifiers;
                        } else if (saved.key) {
                            action.key = saved.key;
                            action.modifiers = saved.modifiers;
                            delete action.inputs;
                            delete action.keys;
                        }
                    }
                });
            }

            if (category.categories) {
                category.categories.forEach(subCat => traverse(subCat, categoryPath));
            }
        };

        this.schema.value.categories?.forEach(cat => traverse(cat));
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
        const newMap = new Map(); // Map<type, Map<slug, entry>>
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
                        
                        // Normalize inputs
                        let inputs = [];
                        if (action.inputs) {
                            inputs = action.inputs;
                        } else if (action.keys) {
                            inputs = action.keys.map(k => ({ ...k, type: 'keyboard' }));
                        } else if (action.key) {
                            inputs = [{ key: action.key, modifiers: action.modifiers, type: 'keyboard' }];
                        }

                        inputs.forEach(input => {
                            const type = input.type || 'keyboard';
                            let slug = '';

                            if (type === 'keyboard') {
                                slug = this._getKeyComboString(input);
                            } else {
                                slug = input.slug;
                            }

                            if (!slug) return;

                            if (!newMap.has(type)) newMap.set(type, new Map());
                            
                            const entry = {
                                action,
                                path: actionPath,
                                categoryPath,
                                type,
                                slug
                            };
                            
                            newMap.get(type).set(slug, entry);
                            activeList.push(entry);
                        });
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
        this.activeInputMap = newMap;
        this.activeKeys.value = activeList;
    }

    _getKeyComboString(binding) {
        const mods = (binding.modifiers || [])
            .map(m => m.toLowerCase())
            .sort()
            .join('+');
        const key = binding.key?.toLowerCase();
        if (!key) return '';
        return mods ? `${mods}+${key}` : key;
    }

    _getEventKeyComboString(event) {
        const mods = [];
        if (event.ctrlKey) mods.push('ctrl');
        if (event.altKey) mods.push('alt');
        if (event.shiftKey) mods.push('shift');
        if (event.metaKey) mods.push('meta');
        
        const key = event.key.toLowerCase();
        if (['control', 'alt', 'shift', 'meta'].includes(key)) return null;
        
        const modsStr = mods.sort().join('+');
        return modsStr ? `${modsStr}+${key}` : key;
    }

    _triggerInput(type, slug, event) {
        const typeMap = this.activeInputMap.get(type);
        if (!typeMap) return;

        const activeAction = typeMap.get(slug);
        if (activeAction) {
            // Only keyboard events get automatic preventDefault
            if (type === 'keyboard' && activeAction.action.allowDefault !== true && event.preventDefault) {
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

            trigger(activeAction.path, activeAction.action);

            if (!propagationStopped) {
                const parts = activeAction.path.split('.');
                parts.pop(); 
                while (parts.length > 0 && !propagationStopped) {
                    const currentPath = parts.join('.');
                    trigger(currentPath, activeAction.action);
                    parts.pop();
                }
            }
        }
    }

    _onKeyDown(event) {
        const path = event.composedPath();
        const isIgnored = path.some(el => {
            if (!el.matches) return false;
            return this.ignoreList.some(selector => el.matches(selector));
        });

        if (isIgnored) return;

        const combo = this._getEventKeyComboString(event);
        if (!combo) return;

        this._triggerInput('keyboard', combo, event);
    }
}
