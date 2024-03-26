import { aTimeout, expect, fixture, html } from '@brightspace-ui/testing';
import { isFramed, reset, tryGet, tryPerform } from '../src/client/client-internal.js';
import sinon from 'sinon';

const mockContextType = 'test-context';
const mockOpts = { test: 'test' };

function assertFramedOneTimeRequestMessage(messageData, type, opts, subscribe) {
	expect(messageData.isContextProvider).to.be.true;
	expect(messageData.type).to.equal(type);
	expect(messageData.options).to.deep.equal(opts);
	expect(messageData.subscribe).to.equal(subscribe);
}

describe('lms-context-provider client', () => {

	const sandbox = sinon.createSandbox();

	afterEach(() => {
		reset();
		sandbox.restore();
	});

	const setUpIsFramedMessageListener = (frame, spy, respond) => {
		const handleIsFramedMessage = e => {
			frame.contentWindow.removeEventListener('message', handleIsFramedMessage);
			if (spy) spy(e.data);
			if (!respond) return;

			window.postMessage({ isContextProvider: true, type: 'framed-request', value: true }, '*');
		};

		frame.contentWindow.addEventListener('message', handleIsFramedMessage);
	};

	describe('is framed', () => {

		let mockFrame;
		beforeEach(async() => {
			mockFrame = await fixture(html`<iframe></iframe>`);
		});

		it('is not framed if the window is its own parent', async() => {
			sandbox.stub(window, 'parent').value(window);
			const listenerSpy = sandbox.spy();
			setUpIsFramedMessageListener(mockFrame, listenerSpy, true);

			const framed = await isFramed();
			expect(framed).to.be.false;
			expect(listenerSpy).not.to.have.been.called;
		});

		it('is not framed if accessing the window parent throws', async() => {
			sandbox.stub(window, 'parent').throws();
			const listenerSpy = sandbox.spy();
			setUpIsFramedMessageListener(mockFrame, listenerSpy, true);

			const framed = await isFramed();
			expect(framed).to.be.false;
			expect(listenerSpy).not.to.have.been.called;
		});

		it('is not framed if the host does not respond to an is-framed request', async() => {
			sandbox.stub(window, 'parent').value(mockFrame.contentWindow);
			const listenerSpy = sandbox.spy();
			setUpIsFramedMessageListener(mockFrame, listenerSpy, false);

			const framed = await isFramed();
			expect(framed).to.be.false;
			expect(listenerSpy).to.have.been.calledOnce;
		});

		it('is framed if the host responds to an is-framed request', async() => {
			sandbox.stub(window, 'parent').value(mockFrame.contentWindow);
			const listenerSpy = sandbox.spy();
			setUpIsFramedMessageListener(mockFrame, listenerSpy, true);

			const framed = await isFramed();
			expect(framed).to.be.true;
			expect(listenerSpy).to.have.been.calledOnce;

			// Validate message params
			expect(listenerSpy.args[0]).to.have.length(1);
			const messageData = listenerSpy.args[0][0];
			assertFramedOneTimeRequestMessage(messageData, 'framed-request', undefined, undefined);
		});

	});

	describe('framed client', () => {

		const sendResponseMessage = (isContextProvider, returnVal, type) => {
			window.postMessage({ isContextProvider: isContextProvider, type: type, options: mockOpts, value: returnVal }, '*');
		};

		const sendSubscriptionChangeMessage = (isContextProvider, type, changedValues) => {
			window.postMessage({ isContextProvider: isContextProvider, type: type, changedValues: changedValues }, '*');
		};

		const setUpMockHostMessageListener = (frame, spy, returnVal, isContextProvider, omitType) => {
			isContextProvider = isContextProvider ?? true;

			const handleMessage = e => {
				// Shortcut past framed-requests, as we're testing isFramed separately
				if (e.data.type === 'framed-request') {
					window.postMessage({ isContextProvider: true, type: 'framed-request', value: true }, '*');
					return;
				}

				frame.contentWindow.removeEventListener('message', handleMessage);
				if (spy) spy(e.data);
				if (!returnVal) return;

				sendResponseMessage(isContextProvider, returnVal, omitType ? undefined : mockContextType);
			};

			frame.contentWindow.addEventListener('message', handleMessage);
		};

		let mockFrame;
		beforeEach(async() => {
			mockFrame = await fixture(html`<iframe></iframe>`);
			sandbox.stub(window, 'parent').value(mockFrame.contentWindow);
		});

		describe('tryGet', () => {

			it('returns requested data when provided by the host', async() => {
				const testVal = 'testVal';
				const requestSpy = sandbox.spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, testVal);

				const val = await tryGet(mockContextType, mockOpts);
				expect(val).to.equal(testVal);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

			it('returns correct requested data when provided by the host on subsequent calls', async() => {
				const firstTestVal = 'testVal';
				const secondTestVal = 'otherTestVal';

				setUpMockHostMessageListener(mockFrame, undefined, firstTestVal);
				await tryGet(mockContextType, mockOpts);

				const requestSpy = sandbox.spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, secondTestVal);

				const secondVal = await tryGet(mockContextType, mockOpts);
				expect(secondVal).to.equal(secondTestVal);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

			it('returns undefined when the host does not respond', async() => {
				const requestSpy = sandbox.spy();
				setUpMockHostMessageListener(mockFrame, requestSpy);

				const val = await tryGet(mockContextType, mockOpts);
				expect(val).to.be.undefined;

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

			it('ignores host response if isContextProvider is not provided in message', async() => {
				const testVal = 'testVal';
				const requestSpy = sandbox.spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, testVal, false);

				const val = await tryGet(mockContextType, mockOpts);
				expect(val).to.be.undefined;

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

			it('ignores host response if type is not provided in message', async() => {
				const testVal = 'testVal';
				const requestSpy = sandbox.spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, testVal, true, true);

				const val = await tryGet(mockContextType, mockOpts);
				expect(val).to.be.undefined;

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

			it('does not send subscribe event if onChange callback is not a function', async() => {
				const requestSpy = sandbox.spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, undefined);

				await tryGet(mockContextType, mockOpts, 'notAFunction');

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

			it('executes onChange callback when valid subscription change message is received', async() => {
				const testValues = {
					testVal: 'testVal'
				};

				const requestSpy = sandbox.spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, undefined);

				const subscriptionSpy = sandbox.spy();
				// Request a value with an onChange callback to set up subscription
				await tryGet(mockContextType, mockOpts, subscriptionSpy);

				// Validate subscription info sent with request
				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, true);

				sendSubscriptionChangeMessage(true, mockContextType, testValues);
				await aTimeout(50);

				expect(subscriptionSpy).to.have.been.calledOnce;
				expect(subscriptionSpy.args[0]).to.have.length(1);

				// Validate values provided to callback
				const changedValues = subscriptionSpy.args[0][0];
				expect(changedValues).to.deep.equal(testValues);
			});

			it('does not execute onChange callback when isContextProvider is missing from subscription change message', async() => {
				const testValues = {
					testVal: 'testVal'
				};

				setUpIsFramedMessageListener(mockFrame, undefined, true);

				const subscriptionSpy = sandbox.spy();
				// Request a value with an onChange callback to set up subscription
				await tryGet(mockContextType, mockOpts, subscriptionSpy);

				sendSubscriptionChangeMessage(false, mockContextType, testValues);
				await aTimeout(50);

				expect(subscriptionSpy).not.to.have.been.called;
			});

			it('does not execute onChange callback when type is missing from subscription change message', async() => {
				const testValues = {
					testVal: 'testVal'
				};

				setUpIsFramedMessageListener(mockFrame, undefined, true);

				const subscriptionSpy = sandbox.spy();
				// Request a value with an onChange callback to set up subscription
				await tryGet(mockContextType, mockOpts, subscriptionSpy);

				sendSubscriptionChangeMessage(true, undefined, testValues);
				await aTimeout(50);

				expect(subscriptionSpy).not.to.have.been.called;
			});

			it('does not execute onChange callback when changed values are missing from subscription change message', async() => {
				setUpIsFramedMessageListener(mockFrame, undefined, true);

				const subscriptionSpy = sandbox.spy();
				// Request a value with an onChange callback to set up subscription
				await tryGet(mockContextType, mockOpts, subscriptionSpy);

				sendSubscriptionChangeMessage(true, mockContextType, undefined);
				await aTimeout(50);

				expect(subscriptionSpy).not.to.have.been.called;
			});

		});

		describe('tryPerform', () => {

			it('does not provide a return value if the host response includes one', async() => {
				const testVal = 'testVal';
				const requestSpy = sandbox.spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, testVal);

				const val = await tryPerform(mockContextType, mockOpts);
				expect(val).to.equal(undefined);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

		});

	});

	describe('unframed client', () => {

		const sendSubscriptionChangeEvent = (type, changedValues) => {
			document.dispatchEvent(new CustomEvent(
				'lms-context-change', {
					detail: {
						type: type,
						changedValues: changedValues
					}
				}
			));
		};

		const setUpMockHostEventListener = (spy, returnVal) => {
			const handleContextRequest = e => {
				document.removeEventListener('lms-context-request', handleContextRequest);
				if (spy) spy(e.detail);
				e.detail.value = returnVal;
			};

			document.addEventListener('lms-context-request', handleContextRequest);
		};

		const assertOneTimeRequestEvent = (eventDetails, type, opts, subscribe) => {
			expect(eventDetails.type).to.equal(type);
			expect(eventDetails.options).to.deep.equal(opts);
			expect(eventDetails.subscribe).to.equal(subscribe);
		};

		describe('tryGet', () => {

			it('returns requested data when provided by the host', async() => {
				const testVal = 'testVal';
				const requestSpy = sandbox.spy();
				setUpMockHostEventListener(requestSpy, testVal);

				const val = await tryGet(mockContextType, mockOpts);
				expect(val).to.equal(testVal);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const eventDetails = requestSpy.args[0][0];
				assertOneTimeRequestEvent(eventDetails, mockContextType, mockOpts, false);
			});

			it('returns correct requested data when provided by the host on subsequent calls', async() => {
				const firstTestVal = 'testVal';
				const secondTestVal = 'otherTestVal';

				setUpMockHostEventListener(undefined, firstTestVal);
				await tryGet(mockContextType, mockOpts);

				const requestSpy = sandbox.spy();
				setUpMockHostEventListener(requestSpy, secondTestVal);

				const secondVal = await tryGet(mockContextType, mockOpts);
				expect(secondVal).to.equal(secondTestVal);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const eventDetails = requestSpy.args[0][0];
				assertOneTimeRequestEvent(eventDetails, mockContextType, mockOpts, false);
			});

			it('does not send subscribe event if onChange callback is not a function', async() => {
				const requestSpy = sandbox.spy();
				setUpMockHostEventListener(requestSpy, undefined);

				await tryGet(mockContextType, mockOpts, 'notAFunction');

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const eventDetails = requestSpy.args[0][0];
				assertOneTimeRequestEvent(eventDetails, mockContextType, mockOpts, false);
			});

			it('executes onChange callback when valid subscription change event is received', async() => {
				const testValues = {
					testVal: 'testVal'
				};

				const requestSpy = sandbox.spy();
				setUpMockHostEventListener(requestSpy, undefined);

				const subscriptionSpy = sandbox.spy();
				// Request a value with an onChange callback to set up subscription
				await tryGet(mockContextType, mockOpts, subscriptionSpy);

				// Validate subscription info sent with request
				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const eventDetails = requestSpy.args[0][0];
				assertOneTimeRequestEvent(eventDetails, mockContextType, mockOpts, true);

				sendSubscriptionChangeEvent(mockContextType, testValues);

				expect(subscriptionSpy).to.have.been.calledOnce;
				expect(subscriptionSpy.args[0]).to.have.length(1);

				// Validate values provided to callback
				const changedValues = subscriptionSpy.args[0][0];
				expect(changedValues).to.deep.equal(testValues);
			});

			it('does not execute onChange callback when type is missing from subscription change event', async() => {
				const testValues = {
					testVal: 'testVal'
				};

				const subscriptionSpy = sandbox.spy();
				// Request a value with an onChange callback to set up subscription
				await tryGet(mockContextType, mockOpts, subscriptionSpy);

				sendSubscriptionChangeEvent(undefined, testValues);

				expect(subscriptionSpy).not.to.have.been.called;
			});

		});

		describe('tryPerform', () => {

			it('does not provide a return value if the host response includes one', async() => {
				const testVal = 'testVal';
				const requestSpy = sandbox.spy();
				setUpMockHostEventListener(requestSpy, testVal);

				const val = await tryPerform(mockContextType, mockOpts);
				expect(val).to.equal(undefined);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const eventDetails = requestSpy.args[0][0];
				assertOneTimeRequestEvent(eventDetails, mockContextType, mockOpts, false);
			});

		});

	});

});
