import { aTimeout, expect, fixture, html } from '@brightspace-ui/testing';
import { isFramed, reset, tryGet, tryPerform } from '../src/client/client-internal.js';
import { restore, spy, stub, useFakeTimers } from 'sinon';
import { LmsContextProviderError } from '../src/error.js';

const mockContextType = 'test-context';
const mockOpts = { test: 'test' };

function assertFramedOneTimeRequestMessage(messageData, type, opts, subscribe) {
	expect(messageData.isContextProvider).to.be.true;
	expect(messageData.type).to.equal(type);
	expect(messageData.options).to.deep.equal(opts);
	expect(messageData.subscribe).to.equal(subscribe);
}

describe('lms-context-provider client', () => {

	let clock;
	beforeEach(() => {
		clock = useFakeTimers({
			now: Date.now(),
			shouldAdvanceTime: true
		});
	});

	afterEach(() => {
		reset();
		clock.restore();
		restore();
	});

	describe('is framed', () => {

		const setUpIsFramedMessageListener = (frame, spy, respond) => {
			const handleIsFramedMessage = e => {
				frame.contentWindow.removeEventListener('message', handleIsFramedMessage);
				if (spy) spy(e.data);
				if (!respond) return;

				window.postMessage({ isContextProvider: true, type: 'framed-request', value: true }, '*');
			};

			frame.contentWindow.addEventListener('message', handleIsFramedMessage);
		};

		let mockFrame;
		beforeEach(async() => {
			mockFrame = await fixture(html`<iframe></iframe>`);
		});

		it('is not framed if the window is its own parent', async() => {
			stub(window, 'parent').value(window);
			const listenerSpy = spy();
			setUpIsFramedMessageListener(mockFrame, listenerSpy, true);

			const framed = await isFramed();
			expect(framed).to.be.false;
			expect(listenerSpy).not.to.have.been.called;
		});

		it('is not framed if accessing the window parent throws', async() => {
			stub(window, 'parent').throws();
			const listenerSpy = spy();
			setUpIsFramedMessageListener(mockFrame, listenerSpy, true);

			const framed = await isFramed();
			expect(framed).to.be.false;
			expect(listenerSpy).not.to.have.been.called;
		});

		it('is not framed if the host does not respond to an is-framed request', async() => {
			stub(window, 'parent').value(mockFrame.contentWindow);
			const listenerSpy = spy();
			setUpIsFramedMessageListener(mockFrame, listenerSpy, false);

			const framed = isFramed();
			await clock.tickAsync(75);

			expect(await framed).to.be.false;
			expect(listenerSpy).to.have.been.calledOnce;
		});

		it('is framed if the host responds to an is-framed request', async() => {
			stub(window, 'parent').value(mockFrame.contentWindow);
			const listenerSpy = spy();
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

		const setUpMockHostMessageListener = (frame, spy, respond, returnVal, isContextProvider, omitType) => {
			isContextProvider = isContextProvider ?? true;

			const handleMessage = e => {
				// Shortcut past framed-requests, as we're testing isFramed separately
				if (e.data.type === 'framed-request') {
					window.postMessage({ isContextProvider: true, type: 'framed-request', value: true }, '*');
					return;
				}

				frame.contentWindow.removeEventListener('message', handleMessage);
				if (spy) spy(e.data);
				if (!respond) return;

				sendResponseMessage(isContextProvider, returnVal, omitType ? undefined : mockContextType);
			};

			frame.contentWindow.addEventListener('message', handleMessage);
		};

		let mockFrame;
		beforeEach(async() => {
			mockFrame = await fixture(html`<iframe></iframe>`);
			stub(window, 'parent').value(mockFrame.contentWindow);
		});

		describe('tryGet', () => {

			it('returns requested data when provided by the host', async() => {
				const testVal = 'testVal';
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true, testVal);

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

				setUpMockHostMessageListener(mockFrame, undefined, true, firstTestVal);
				await tryGet(mockContextType, mockOpts);

				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true, secondTestVal);

				const secondVal = await tryGet(mockContextType, mockOpts);
				expect(secondVal).to.equal(secondTestVal);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

			it('rejects when the host does not respond', async() => {
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, false);

				const val = tryGet(mockContextType, mockOpts);
				return val.then(val => {
					expect.fail(`Should reject, but ${val} was returned`);
				}, err => {
					expect(err).to.be.an.instanceof(LmsContextProviderError);

					expect(requestSpy).to.have.been.calledOnce;
					expect(requestSpy.args[0]).to.have.length(1);

					const messageData = requestSpy.args[0][0];
					assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
				});
			});

			it('rejects if isContextProvider is not provided in message', async() => {
				const testVal = 'testVal';
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true, testVal, false);

				const val = tryGet(mockContextType, mockOpts);
				return val.then(val => {
					expect.fail(`Should reject, but ${val} was returned`);
				}, err => {
					expect(err).to.be.an.instanceof(LmsContextProviderError);

					expect(requestSpy).to.have.been.calledOnce;
					expect(requestSpy.args[0]).to.have.length(1);

					const messageData = requestSpy.args[0][0];
					assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
				});
			});

			it('rejects if type is not provided in message', async() => {
				const testVal = 'testVal';
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true, testVal, true, true);

				const val = tryGet(mockContextType, mockOpts);
				return val.then(val => {
					expect.fail(`Should reject, but ${val} was returned`);
				}, err => {
					expect(err).to.be.an.instanceof(LmsContextProviderError);

					expect(requestSpy).to.have.been.calledOnce;
					expect(requestSpy.args[0]).to.have.length(1);

					const messageData = requestSpy.args[0][0];
					assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
				});
			});

			it('does not send subscribe event if onChange callback is not a function', async() => {
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true);

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

				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true);

				const subscriptionSpy = spy();
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

				setUpMockHostMessageListener(mockFrame, undefined, true);

				const subscriptionSpy = spy();
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

				setUpMockHostMessageListener(mockFrame, undefined, true);

				const subscriptionSpy = spy();
				// Request a value with an onChange callback to set up subscription
				await tryGet(mockContextType, mockOpts, subscriptionSpy);

				sendSubscriptionChangeMessage(true, undefined, testValues);
				await aTimeout(50);

				expect(subscriptionSpy).not.to.have.been.called;
			});

			it('does not execute onChange callback when changed values are missing from subscription change message', async() => {
				setUpMockHostMessageListener(mockFrame, undefined, true);

				const subscriptionSpy = spy();
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
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true, testVal);

				const val = await tryPerform(mockContextType, mockOpts);
				expect(val).to.equal(undefined);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const messageData = requestSpy.args[0][0];
				assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
			});

			it('rejects if the host does not respond', async() => {
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, false);

				return tryPerform(mockContextType, mockOpts).then(() => {
					expect.fail('Should reject, but did not');
				}, err => {
					expect(err).to.be.an.instanceof(LmsContextProviderError);

					expect(requestSpy).to.have.been.calledOnce;
					expect(requestSpy.args[0]).to.have.length(1);

					const messageData = requestSpy.args[0][0];
					assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
				});
			});

			it('rejects if isContextProvider is not provided in message', async() => {
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true, undefined, false);

				return tryPerform(mockContextType, mockOpts).then(() => {
					expect.fail('Should reject, but did not');
				}, err => {
					expect(err).to.be.an.instanceof(LmsContextProviderError);

					expect(requestSpy).to.have.been.calledOnce;
					expect(requestSpy.args[0]).to.have.length(1);

					const messageData = requestSpy.args[0][0];
					assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
				});
			});

			it('rejects if type is not provided in message', async() => {
				const requestSpy = spy();
				setUpMockHostMessageListener(mockFrame, requestSpy, true, undefined, true, true);

				return tryPerform(mockContextType, mockOpts).then(() => {
					expect.fail('Should reject, but did not');
				}, err => {
					expect(err).to.be.an.instanceof(LmsContextProviderError);

					expect(requestSpy).to.have.been.calledOnce;
					expect(requestSpy.args[0]).to.have.length(1);

					const messageData = requestSpy.args[0][0];
					assertFramedOneTimeRequestMessage(messageData, mockContextType, mockOpts, false);
				});
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

		const setUpMockHostEventListener = (spy, handled, returnVal) => {
			const handleContextRequest = e => {
				document.removeEventListener('lms-context-request', handleContextRequest);
				if (spy) spy(e.detail);
				e.detail.handled = handled;
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
				const requestSpy = spy();
				setUpMockHostEventListener(requestSpy, true, testVal);

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

				setUpMockHostEventListener(undefined, true, firstTestVal);
				await tryGet(mockContextType, mockOpts);

				const requestSpy = spy();
				setUpMockHostEventListener(requestSpy, true, secondTestVal);

				const secondVal = await tryGet(mockContextType, mockOpts);
				expect(secondVal).to.equal(secondTestVal);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const eventDetails = requestSpy.args[0][0];
				assertOneTimeRequestEvent(eventDetails, mockContextType, mockOpts, false);
			});

			it('does not send subscribe event if onChange callback is not a function', async() => {
				const requestSpy = spy();
				setUpMockHostEventListener(requestSpy, true, undefined);

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

				const requestSpy = spy();
				setUpMockHostEventListener(requestSpy, true, undefined);

				const subscriptionSpy = spy();
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

				setUpMockHostEventListener(undefined, true, 'junk');

				const subscriptionSpy = spy();
				// Request a value with an onChange callback to set up subscription
				await tryGet(mockContextType, mockOpts, subscriptionSpy);

				sendSubscriptionChangeEvent(undefined, testValues);

				expect(subscriptionSpy).not.to.have.been.called;
			});

		});

		describe('tryPerform', () => {

			it('does not provide a return value if the host response includes one', async() => {
				const testVal = 'testVal';
				const requestSpy = spy();
				setUpMockHostEventListener(requestSpy, true, testVal);

				const val = await tryPerform(mockContextType, mockOpts);
				expect(val).to.equal(undefined);

				expect(requestSpy).to.have.been.calledOnce;
				expect(requestSpy.args[0]).to.have.length(1);

				const eventDetails = requestSpy.args[0][0];
				assertOneTimeRequestEvent(eventDetails, mockContextType, mockOpts, false);
			});

			it('rejects if the host does not respond', async() => {
				const requestSpy = spy();
				setUpMockHostEventListener(requestSpy, false);

				return tryPerform(mockContextType, mockOpts).then(() => {
					expect.fail('Should reject, but did not');
				}, err => {
					expect(err).to.be.an.instanceof(LmsContextProviderError);

					expect(requestSpy).to.have.been.calledOnce;
					expect(requestSpy.args[0]).to.have.length(1);

					const eventDetails = requestSpy.args[0][0];
					assertOneTimeRequestEvent(eventDetails, mockContextType, mockOpts, false);
				});
			});

		});

	});

});
