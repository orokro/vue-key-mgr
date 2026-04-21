# vue-key-mgr

A context-aware, reactive key-management system for Vue 3.

## Features

- **Hierarchical Schema**: Define keys in categories with nested enabled states.
- **Reactive**: Key availability is driven by Vue's reactive state (Refs/Computeds).
- **Declarative**: No manual stack management; the schema state drives the key map.
- **Path-based Subscriptions**: Subscribe to specific actions or entire categories.
- **Automatic Prevention**: Handles `event.preventDefault()` automatically (configurable).
- **Ignore List**: Automatically ignores events from inputs, textareas, or custom selectors.

## Installation

```bash
npm install vue-key-mgr
```

## Quick Start

### 1. Define your Schema and Initialize

In your main entry point or a top-level component:

```javascript
import { useKeyManager } from 'vue-key-mgr'
import { ref, computed } from 'vue'

const isEditorActive = ref(true)

const schema = {
  categories: [
    {
      name: 'editor',
      enabled: isEditorActive,
      actions: [
        { name: 'save', key: 's', modifiers: ['ctrl'], desc: 'Save' }
      ]
    }
  ]
}

const { initKeyMgr } = useKeyManager()
initKeyMgr(schema)
```

### 2. Subscribe to Actions

In any component:

```javascript
import { useKeyAction } from 'vue-key-mgr'

useKeyAction('editor.save', (event, action) => {
  console.log('Saving project...')
})
```

### 3. Category Listeners & Propagation

You can also listen to entire categories and stop propagation to parent listeners:

```javascript
useKeyAction('editor', (event, action, { stopPropagation }) => {
  console.log(`Any action in 'editor' triggered: ${action.name}`)
  // stopPropagation() // Prevent bubbling to higher categories
})
```

## Schema Structure

- **Category**:
    - `name`: string (used in path)
    - `enabled`: Ref<boolean> | ComputedRef<boolean> | boolean
    - `actions`: Array of Action objects
    - `categories`: Nested Categories
- **Action**:
    - `name`: string (used in path)
    - `key`: string (e.g., 'f1', 'e', 'enter')
    - `modifiers`: Array of strings ('ctrl', 'alt', 'shift', 'meta')
    - `allowDefault`: boolean (default: false)
    - `desc`: string (optional description)

## Development

```bash
# Start dev environment (demo app)
npm run dev

# Build library
npm run build
```
