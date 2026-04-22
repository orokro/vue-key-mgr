# vue-key-mgr

A context-aware, reactive key-management system for Vue 3.

## Features

- **Hierarchical Schema**: Define keys in categories with nested enabled states.
- **Reactive**: Key availability is driven by Vue's reactive state (Refs/Computeds).
- **Declarative**: No manual stack management; the schema state drives the key map.
- **Path-based Subscriptions**: Subscribe to specific actions or entire categories.
- **Automatic Prevention**: Handles `event.preventDefault()` automatically (configurable).
- **Ignore List**: Automatically ignores events from inputs, textareas, or custom selectors.
- **Serialization**: Easily export and hydrate key bindings for user-defined shortcuts.
- **Active Key Tracking**: Reactive list of currently available keys for UI/Status bars.
- **Custom Input Providers**: Support for gamepads, MIDI, or any HID device via a simple provider API.
- **Universal Input Mode**: Single action can be bound to multiple keyboard, gamepad, and custom inputs.

## Installation
...
## Serialization & Persistence

You can export the current key configuration (minus the reactive logic) to save to a database or `localStorage`:

```javascript
const { getBindings, applyBindings } = useKeyManager()

// Save
const bindings = getBindings()
localStorage.setItem('my-keys', JSON.stringify(bindings))

// Load
const saved = localStorage.getItem('my-keys')
if (saved) applyBindings(JSON.parse(saved))
```

## Custom Input Providers

You can register custom systems to trigger actions:

```javascript
const { registerProvider } = useKeyManager()

registerProvider('gamepad', (emit) => {
  // Your driver logic here
  window.addEventListener('gamepadbuttondown', (e) => {
    emit(`button_${e.button}`)
  })
})
```

Then in your schema:

```javascript
{
  name: 'jump',
  inputs: [
    { key: 'space' }, // default type: keyboard
    { type: 'gamepad', slug: 'button_0' }
  ]
}
```

## Active Key Tracking (Status Bar)

To show which keys are currently active in the UI:

```javascript
const { activeKeys } = useKeyManager()
```

`activeKeys` is a `shallowRef` containing an array of objects:
`{ action: Object, path: string, categoryPath: string, combo: string }`

```html
<div class="status-bar">
  <span v-for="key in activeKeys" :key="key.path">
    {{ key.combo }}: {{ key.action.desc }}
  </span>
</div>
```

## Schema Structure

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
    - `key`: string (e.g., 'f1', 'e', 'enter') - *Legacy single key mode*
    - `modifiers`: Array of strings ('ctrl', 'alt', 'shift', 'meta') - *Legacy single key mode*
    - `keys`: Array of `{ key: string, modifiers?: string[] }` - *Multi-key keyboard mode*
    - `inputs`: Array of `{ type?: string, key?: string, modifiers?: string[], slug?: string }` - *Universal input mode*
    - `allowDefault`: boolean (default: false)
    - `desc`: string (optional description)

## Development

```bash
# Start dev environment (demo app)
npm run dev

# Build library
npm run build
```
