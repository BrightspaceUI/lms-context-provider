# @d2l/lms-context-provider

Provides LMS context and environment settings to UI components, applications and libraries.

## Installation

Install from CodeArtifact:

```shell
npm install @d2l/lms-context-provider
```

## Usage

### Configuring a Host

#### Initializing

Initializing a host should rarely be necessary. Within a Brightspace instance, this will generally be handled by BSI via our MVC and legacy frameworks. If you do need to initialize a host, simply import and execute the `initialize` function.

```js
import { initialize } from '@d2l/lms-context-provider/host.js';

initialize();
```

#### Registering Plugins

To register a host plugin, import and execute the `registerPlugin` function on a page where a host has already been initialized. The provided context type should be unique per page. If your plugin needs to return data to a client, it should provide a `tryGetCallback` as the second argument. If it allows subscriptions to change events, then it should provide a `subscribeCallback` as the third argument.

```js
import { registerPlugin } from '@d2l/lms-context/provider/host.js';

function tryGetCallback(options) {
	// This can be asynchronous.
	const returnVal = doSomeWork(options);
	return returnVal;
}

function subscribeCallback(onChange, options) {
	// this can be asynchronous.
	const returnVal = doSomeWork(options);

	// Options are defined by the host, not the plugin. sendImmediate indicates the change handler should be invoked immediately.
	if (options.sendImmediate) {
		// Expects an object as its only argument.
		onChange({ val: returnVal });
	}

	// onChange event should be subscribed to future changes.
	registerOnChangeEvent(onChange);
}

registerPlugin('my-context-type', tryGetCallback, subscribeCallback);
```

#### Framed Clients

When working with a client inside an iframe, the host page needs to explicitly allow that iframe. To do this, import and execute `allowFrame` from the host page. The host must already be initialized. The first argument must be the iframe element itself. The second argument should be the expected origin. Requests from clients within iframes that have not explicitly bene allowed or that come from a different origin will be ignored.

```js
import { allowFrame } from '@d2l/lms-context-provider/host.js';

const myFrame = document.createElement('iframe');
document.body.append(myFrame);

allowFrame(myFrame, window.location.origin);
```

### Using a Client

#### Requesting Data

When your library or component is expecting data to be returned, import `tryGet` from the client and invoke it directly. The first argument should be a context type corresponding to a registered host plugin, while the second argument is an optional set of options to pass through to the host plugin. The third argument is an optional callback to allow a consumer to subscribe to future changes to the data they're requesting.

```js
import { tryGet } from '@d2l/lms-context-provider/client.js';

// This callback should accept a single argument, an object containing any relevant information from the host plugin.
function onChangeCallback(changedValues) {
	if (changedValues.someChangedProp === 'someVal') {
		doSomeWork(changedValues.someChangedProp);
	}
}

const val = await tryGet('my-context-type', { someProp: someVal }, onChangeCallback);
doSomeWork(val);
```

If no host plugin is registered to handle your request, or if the data being requested isn't available, the host will return `undefined`. The host plugin may also need to rely on asynchronous methods to return data, so your code should be resilient to receiving a promise that doesn't resolve or takes some time to resolve.

#### Performing an Action

If your library or component needs to initiate an action on the host but doesn't require return data, import `tryPerform` from the client and invoke it directly. The first argument should be a context type corresponding to a registered host plugin, while the second argument is an optional set of options to pass through to the host plugin. It is not possible to subscribe to change events using this function.

```js
import { tryPerform } from '@d2l/lms-context-provider/client.js;'

await tryPerform('my-context-type', { someProp: someVal });
```

If no host plugin is registered to handle your request, or if the data being requested isn't available, this promise will immediately resolve and nothing will happen. As with the `tryGet` function, the host plugin may need to perform asynchronous actions to fulfill your request, so this promise may also never resolve, or may take some time to resolve.

## Developing, Testing and Contributing

After cloning the repo, run `npm install` to install dependencies.

### Linting

```shell
# eslint
npm run lint
```

### Testing

```shell
# run tests
npm test
```

### Versioning and Releasing

This repo is configured to use `semantic-release`. Commits prefixed with `fix:` and `feat:` will trigger patch and minor releases when merged to `main`.

To learn how to create major releases and release from maintenance branches, refer to the [semantic-release GitHub Action](https://github.com/BrightspaceUI/actions/tree/main/semantic-release) documentation.
