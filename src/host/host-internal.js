let initialized = false;

const allowedFrames = new Map();
const registeredPlugins = new Map();
const subscriptionQueue = new Set();

function handleContextRequest(type, options, subscribe) {
	const plugin = registeredPlugins.get(type);

	if (subscribe && !subscriptionQueue.has(type)) {
		subscriptionQueue.add(type);
		if (plugin && plugin.subscribe) plugin.subscribe(changedValues => sendChangeEvent(type, changedValues));
	}

	return plugin && plugin.tryGet && plugin.tryGet(options);
}

function handleContextRequestEvent(e) {
	if (!e.detail || !e.detail.type) return;
	e.detail.value = handleContextRequest(e.detail.type, e.detail.options, e.detail.subscribe);
}

function handleContextRequestMessage(e) {
	if (!e.data.isContextProvider || !e.data.type || !/^(?:http|https):\/\//.test(e.origin)) return;

	let targetFrame;
	for (const frame of allowedFrames.keys()) {
		if (frame.contentWindow === e.source) {
			targetFrame = frame;
			break;
		}
	}

	if (!targetFrame || allowedFrames.get(targetFrame) !== e.origin) return;

	const messageType = e.data.type;
	if (messageType === 'framed-request') {
		targetFrame.contentWindow.postMessage({ isContextProvider: true, type: 'framed-request', value: true }, e.origin);
		return;
	}

	const value = handleContextRequest(messageType, e.data.options, e.data.subscribe);
	targetFrame.contentWindow.postMessage({ isContextProvider: true, type: messageType, value: value }, e.origin);
}

function sendChangeEvent(type, changedValues) {
	// Dispatch document-level change event for any non-framed consumers.
	document.dispatchEvent(new CustomEvent(
		'lms-context-change', {
			detail: {
				type: type,
				changedValues: changedValues
			}
		}
	));

	// Dispatch postMessages to registered frames
	allowedFrames.forEach((origin, frame) => {
		frame.contentWindow.postMessage({ isContextProvider: true, type: type, changedValues: changedValues }, origin);
	});
}

export function initialize() {
	if (initialized) return;

	window.addEventListener('message', handleContextRequestMessage);
	document.addEventListener('lms-context-request', handleContextRequestEvent);

	initialized = true;
}

export function allowFrame(frame, origin) {
	if (!initialized) {
		throw new Error(`lms-context-provider: Can't register frame with id ${frame.id}. Context provider host has not been initialized.`);
	}

	if (allowedFrames.has(frame)) {
		throw new Error(`lms-context-provider: A frame with id ${frame.id} has already been registered with this host.`);
	}

	allowedFrames.set(frame, origin);
}

export function registerPlugin(type, tryGetCallback, subscriptionCallback) {
	if (!initialized) {
		throw new Error(`lms-context-provider: Can't register plugin with type ${type}. Context provider host has not been initialized.`);
	}

	if (registeredPlugins.has(type)) {
		throw new Error(`lms-context-provider: A plugin with type ${type} has already been registered with this host.`);
	}

	registeredPlugins.set(type, {
		tryGet: tryGetCallback,
		subscribe: subscriptionCallback
	});

	// Process any existing subscription requests
	if (subscriptionQueue.has(type) && subscriptionCallback) {
		subscriptionCallback(changedValues => sendChangeEvent(type, changedValues), { sendImmediate: true });
	}
}

// DO NOT IMPORT! Used for testing only!
export function reset() {
	if (!initialized) return;

	window.removeEventListener('message', handleContextRequestMessage);
	document.removeEventListener('lms-context-request', handleContextRequestEvent);

	allowedFrames.clear();
	registeredPlugins.clear();
	subscriptionQueue.clear();

	initialized = false;
}
