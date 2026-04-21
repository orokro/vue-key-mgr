<script setup>
import { ref, computed, onMounted } from 'vue'
import { useKeyManager, useKeyAction } from 'vue-key-mgr'

const isEditorActive = ref(true)
const isModalOpen = ref(false)
const currentTool = ref('none')
const log = ref([])

const addLog = (msg) => {
	log.value.unshift(`${new Date().toLocaleTimeString()}: ${msg}`)
	if (log.value.length > 10) log.value.pop()
}

// 1. Initialize the Key Manager with the hierarchical schema
const { initKeyMgr, activeKeys, getBindings, applyBindings } = useKeyManager()

const saveBindings = () => {
  const bindings = getBindings()
  localStorage.setItem('vkm-bindings', JSON.stringify(bindings))
  addLog('Bindings saved to localStorage')
}

const loadBindings = () => {
  const saved = localStorage.getItem('vkm-bindings')
  if (saved) {
    applyBindings(JSON.parse(saved))
    addLog('Bindings loaded and applied')
  } else {
    addLog('No saved bindings found')
  }
}

const resetBindings = () => {
    // Just a quick way to demonstrate changing them
    applyBindings({
        'editor.help': { key: 'h', modifiers: [] },
        'global.save': { key: 'enter', modifiers: ['ctrl', 'shift'] }
    })
    addLog('Bindings reset to custom defaults (Help=H, Save=Ctrl+Shift+Enter)')
}

const schema = {
	categories: [
		{
			name: 'editor',
			enabled: isEditorActive,
			actions: [
				{
					name: 'help',
					key: 'f1',
					desc: 'Shows editor help page',
				}
			],
			categories: [
				{
					name: 'tool-selection',
					enabled: computed(() => !isModalOpen.value),
					actions: [
						{
							name: 'eraser',
							key: 'e',
							desc: 'Select Eraser Tool',
						}
					]
				},
				{
					name: 'extrusion-mode',
					// If this is active, its 'e' binding overrides 'tool-selection'
					enabled: computed(() => currentTool.value === 'pixelExtrusion'),
					actions: [
						{
							name: 'extrude-pixels',
							key: 'e',
							desc: 'Smears pixel selection under cursor',
						}
					]
				}
			]
		},
		{
			name: 'global',
			actions: [
				{
					name: 'save',
					key: 's',
					modifiers: ['ctrl'],
					desc: 'Save project'
				}
			]
		}
	]
}

onMounted(() => {
	initKeyMgr(schema)
})

// 2. Subscribe to actions using the path-based API
useKeyAction('editor.help', (event, action) => {
	addLog(`Action: ${action.name} (Path: editor.help) triggered by ${event.key}`)
})

useKeyAction('editor.tool-selection.eraser', (event, action) => {
	addLog(`Action: ${action.name} triggered. Select Eraser tool.`)
})

useKeyAction('editor.extrusion-mode.extrude-pixels', (event, action) => {
	addLog(`Action: ${action.name} triggered. Extruding pixels!`)
})

useKeyAction('global.save', (event, action) => {
	addLog('Project Saved! (Ctrl+S)')
})

// 3. Category subscription example
useKeyAction('editor', (event, action, { stopPropagation }) => {
	addLog(`Category Listener [editor]: Action ${action.name} bubbled up.`)
})

</script>

<template>
	<div class="demo">
		<h1>vue-key-mgr Demo</h1>

		<div class="controls">
		  <section>
		    <h3>State Controls</h3>
		    <label>
		      <input type="checkbox" v-model="isEditorActive"> Editor Enabled
		    </label>
		    <br>
		    <label>
		      <input type="checkbox" v-model="isModalOpen"> Modal Open (Disables Tool Selection)
		    </label>
		    <br>
		    <label>
		      Current Tool:
		      <select v-model="currentTool">
		        <option value="none">None</option>
		        <option value="pixelExtrusion">Pixel Extrusion (Overrides 'e' key)</option>
		      </select>
		    </label>
		  </section>

		  <section>
		    <h3>Serialization</h3>
		    <button @click="saveBindings">Save Bindings</button>
		    <button @click="loadBindings">Load Bindings</button>
		    <button @click="resetBindings">Reset Bindings</button>
		    <p><small>Changes are local to this session until "Save" is clicked.</small></p>
		  </section>

		  <section>
		    <h3>Try These Keys:</h3>
		    <ul>
		      <li><strong>{{ schema.categories[0].actions[0].key }}</strong>: Help</li>
		      <li><strong>E</strong>: Eraser / Extrude</li>
		      <li><strong>Ctrl + S</strong>: Save</li>
		    </ul>
		  </section>
		</div>

		<div class="status-bar">
		    <strong>Active Keys:</strong>
		    <span v-if="activeKeys.length === 0">None</span>
		    <span v-for="ak in activeKeys" :key="ak.path" class="key-tag">
		        <code>{{ ak.combo }}</code>: {{ ak.path }}
		    </span>
		</div>

		<div class="test-area">

			<h3>Interaction Test</h3>
			<p>Try typing in this input (Keys should be ignored):</p>
			<input type="text" placeholder="Type here...">

			<div class="log-container">
				<h3>Action Log:</h3>
				<div v-if="log.length === 0" class="empty-log">Press keys to see actions...</div>
				<ul class="log">
					<li v-for="(entry, i) in log" :key="i">{{ entry }}</li>
				</ul>
			</div>
		</div>
	</div>
</template>

<style scoped>
.demo {
	font-family: sans-serif;
	max-width: 800px;
	margin: 0 auto;
	padding: 20px;
	line-height: 1.5;
}

.controls {
	display: flex;
	gap: 40px;
	background: #f4f4f4;
	padding: 20px;
	border-radius: 8px;
	margin-bottom: 20px;
}

section h3 {
	margin-top: 0;
}

.test-area {
	border: 1px solid #ddd;
	padding: 20px;
	border-radius: 8px;
}

.log-container {
	margin-top: 20px;
	background: #222;
	color: #0f0;
	padding: 15px;
	border-radius: 4px;
	min-height: 200px;
}

.log {
	list-style: none;
	padding: 0;
	margin: 0;
}

.log li {
	font-family: monospace;
	border-bottom: 1px solid #333;
	padding: 4px 0;
}

.empty-log {
	color: #666;
	font-style: italic;
}

input[type="text"] {
	width: 100%;
	padding: 8px;
	margin-bottom: 10px;
}
.status-bar {
  background: #333;
  color: #fff;
  padding: 10px 15px;
  border-radius: 4px;
  margin-bottom: 20px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.key-tag {
  background: #444;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.9em;
  border: 1px solid #555;
}

.key-tag code {
  color: #0f0;
}
</style>
