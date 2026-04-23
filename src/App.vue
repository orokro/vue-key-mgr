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
const { initKeyMgr, activeKeys, getBindings, applyBindings, registerProvider } = useKeyManager()

const gamepadConnected = ref(false)
const hidDevices = ref([])

// Define helpers locally so template can see them
const simulateGamepad = ref(null)
const refreshGamepadList = ref(null)
const forceGamepadWakeup = ref(null)
const connectHID = ref(null)

// Register real gamepad provider
registerProvider('gamepad', (emit) => {
	console.log('[Gamepad] Provider factory initialized');

	// state maps: index -> { buttons: Map<slug, boolean>, axes: Map<slug, boolean> }
	const gamepadStates = new Map();

	simulateGamepad.value = (buttonSlug) => {
		emit(buttonSlug, { simulated: true });
	};

	// --- WebHID Logic ---
	connectHID.value = async () => {
		if (!navigator.hid) {
			alert('WebHID is not supported in this browser or context (requires HTTPS/Localhost).');
			return;
		}

		try {
			const devices = await navigator.hid.requestDevice({ filters: [] });
			if (devices.length > 0) {
				devices.forEach(setupHIDDevice);
			}
		} catch (err) {
			console.error('[WebHID] Connection failed:', err);
		}
	};

	const setupHIDDevice = (device) => {
		console.log(`[WebHID] Connected to: ${device.productName}`);
		addLog(`HID Connected: ${device.productName}`);

		let lastState = null;

		if (!device.opened) {
			device.open().then(() => {
				device.addEventListener('inputreport', (event) => {
					const { data, reportId } = event;
					if (data.byteLength > 0) {
						const view = new Uint8Array(data.buffer);
						const current = Array.from(view.slice(0, 16)); // Read more bytes just in case

						if (!gamepadConnected.value) gamepadConnected.value = true;

						// Identify which bytes changed
						if (lastState) {
							current.forEach((val, i) => {
								if (val !== lastState[i]) {
									// Map Byte 10 to button_1 (Turbo Boost)
									if (i === 10) {
										if (val === 1) emit('button_1', { originalEvent: event, hid: true });
									}
								}
							});
						}
						lastState = current;

						emit('hid_input', {
							device: device.productName,
							reportId,
							raw: current
						});
					}
				});
			});
		}
	};

	// Auto-reconnect existing HID permissions
	if (navigator.hid) {
		navigator.hid.getDevices().then(devices => {
			devices.forEach(setupHIDDevice);
		});
	}
	// --- End WebHID Logic ---

	// Manual debug helpers
	refreshGamepadList.value = () => {
		const gps = navigator.getGamepads ? navigator.getGamepads() : [];
		const active = Array.from(gps).filter(g => g !== null);
		console.log('[Gamepad] Manual Refresh. Active count:', active.length);
		addLog(`Manual refresh: Found ${active.length} active gamepads.`);
		active.forEach(gp => {
			console.log(` - [${gp.index}] ${gp.id} (Mapping: ${gp.mapping || 'none'})`);
		});
	}

	forceGamepadWakeup.value = () => {
		console.log('[Gamepad] Force Wakeup Triggered...');
		const gps = navigator.getGamepads ? navigator.getGamepads() : [];
		const active = Array.from(gps).filter(g => g !== null);

		if (active.length > 0) {
			gamepadConnected.value = true;
			addLog(`Force wakeup: Found ${active.length} gamepads.`);
			console.log('[Gamepad] Active:', active.map(g => g.id));
		} else {
			addLog('Force wakeup: Still 0 gamepads. Interaction required.');
			console.log('[Gamepad] No active gamepads. Note: Most browsers require a button press first.');
		}
	}

	const poll = () => {
		const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
		let anyConnected = false;

		for (let i = 0; i < gamepads.length; i++) {
			const gp = gamepads[i];
			if (!gp) {
				if (gamepadStates.has(i)) {
					gamepadStates.delete(i);
					console.log(`[Gamepad] Slot ${i} disconnected.`);
				}
				continue;
			}

			anyConnected = true;
			if (!gamepadStates.has(i)) {
				gamepadStates.set(i, { buttons: new Map(), axes: new Map() });
				console.log(`[Gamepad] Detected [${i}]: ${gp.id}`);
				addLog(`Gamepad Detected: ${gp.id}`);
			}

			const state = gamepadStates.get(i);

			// 1. Poll Buttons
			gp.buttons.forEach((btn, index) => {
				const slug = `button_${index}`;
				const wasPressed = state.buttons.get(slug) || false;
				const isPressed = btn.pressed;

				if (isPressed && !wasPressed) {
					emit(slug, { originalEvent: btn, gamepad: gp });
				}
				state.buttons.set(slug, isPressed);
			});

			// 2. Poll Axes (mapped to virtual buttons)
			gp.axes.forEach((val, index) => {
				const threshold = 0.5;
				const directions = [
					{ slug: `axis_${index}_pos`, active: val > threshold },
					{ slug: `axis_${index}_neg`, active: val < -threshold }
				];

				directions.forEach(dir => {
					const wasActive = state.axes.get(dir.slug) || false;
					if (dir.active && !wasActive) {
						emit(dir.slug, { value: val, gamepad: gp });
					}
					state.axes.set(dir.slug, dir.active);
				});
			});
		}

		if (gamepadConnected.value !== anyConnected) {
			gamepadConnected.value = anyConnected;
		}

		requestAnimationFrame(poll);
	}

	window.addEventListener('gamepadconnected', (e) => {
		console.log('[Gamepad] EVENT: Connected', e.gamepad.id);
		gamepadConnected.value = true;
		addLog(`Gamepad connected: ${e.gamepad.id}`);
	});

	window.addEventListener('gamepaddisconnected', (e) => {
		console.log('[Gamepad] EVENT: Disconnected', e.gamepad.id);
		const gps = navigator.getGamepads();
		const stillConnected = Array.from(gps || []).some(g => g !== null);
		gamepadConnected.value = stillConnected;
		addLog(`Gamepad disconnected: ${e.gamepad.id}`);
	});

	console.log('[Gamepad] Polling loop started.');
	requestAnimationFrame(poll);
})

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
				},
				{
					name: 'delete-item',
					keys: [
						{ key: 'delete' },
						{ key: 'backspace' },
						{ key: 'd', modifiers: ['ctrl'] },
						{ key: 'x', modifiers: ['shift'] }
					],
					desc: 'Delete the selected item'
				},
				{
					name: 'turbo-boost',
					inputs: [
						{ type: 'keyboard', key: 't', modifiers: ['shift'] },
						{ type: 'gamepad', slug: 'button_1' }
					],
					desc: 'Engage turbo boost!'
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

useKeyAction('global.delete-item', (event, action) => {
	addLog(`Delete action triggered by: ${event.key}`)
})

useKeyAction('global.turbo-boost', (event, action) => {
	let source = 'Keyboard'
	if (event.simulated) source = 'Gamepad (Simulated)'
	else if (event.hid) source = 'HID Controller'
	else if (event.gamepad) source = 'Gamepad'
	else if (event.key) source = `Keyboard (${event.key})`

	addLog(`TURBO BOOST triggered via ${source}!`)
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
				<button @click="console.log('Current Bindings:', getBindings())">Log Bindings</button>
				<p><small>Changes are local to this session until "Save" is clicked.</small></p>
			</section>

			<section>
				<h3>Custom Inputs</h3>
				<p>
					Gamepad Status:
					<span :style="{ color: gamepadConnected ? '#0f0' : '#f00' }">
						{{ gamepadConnected ? 'Connected' : 'Disconnected' }}
					</span>
					<br>
					<small v-if="!gamepadConnected">Press any button on your controller or use HID Connect.</small>
				</p>

				<div style="display: flex; flex-direction: column; gap: 5px;">
					<button @click="connectHID">Connect via WebHID (Experimental Fix)</button>
					<button @click="simulateGamepad?.('button_1')">Simulate Gamepad Button 1</button>
					<button @click="refreshGamepadList?.()">Refresh Gamepad List</button>
					<button @click="forceGamepadWakeup?.()">FORCE Gamepad Wakeup</button>
				</div>
			</section>

			<section>
				<h3>Try These Keys:</h3>
				<ul>
					<li><strong>F1</strong>: Help</li>
					<li><strong>E</strong>: Eraser / Extrude</li>
					<li><strong>Ctrl + S</strong>: Save</li>
					<li><strong>Delete, Backspace, or Ctrl + D</strong>: Delete Item</li>
					<li><strong>Shift + T / Gamepad (Simulated)</strong>: Turbo Boost</li>
				</ul>
			</section>
		</div>

		<div class="status-bar">
			<strong>Active Inputs:</strong>
			<span v-if="activeKeys.length === 0">None</span>
			<span v-for="ak in activeKeys" :key="ak.path + ak.slug" class="key-tag">
				<code>[{{ ak.type }}] {{ ak.slug || ak.combo }}</code>: {{ ak.path }}
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
