import { allowFrame, initialize, registerPlugin, reset } from '../src/host/host-internal.js';
import { aTimeout, expect, fixture, html } from '@brightspace-ui/testing';
import { restore, spy, stub } from 'sinon';
import { LmsContextProviderError } from '../src/error.js';

const eventListenerType = 'lms-context-request';
const messageListenerType = 'message';

const mockContextType = 'test-context';
const otherMockContextType = 'other-test-context';
const mockOpts = { test: 'test' };

describe('lms-context-provider host', () => {

	afterEach(() => {
		reset();
		restore();
	});

	describe('initialization', () => {

		it('sets up appropriate event handlers when initialized', () => {
			const docSpy = spy(document, 'addEventListener');
			const windowSpy = spy(window, 'addEventListener');

			initialize();

			expect(docSpy).to.have.been.calledOnce;
			expect(docSpy).to.have.always.been.calledWithMatch(eventListenerType);
			expect(docSpy.args[0]).to.have.length(2);
			expect(docSpy.args[0][1]).to.be.a('function');

			expect(windowSpy).to.have.been.calledOnce;
			expect(windowSpy).to.have.always.been.calledWithMatch(messageListenerType);
			expect(windowSpy.args[0]).to.have.length(2);
			expect(windowSpy.args[0][1]).to.be.a('function');

		});

		it('does not throw on multiple initializations', () => {
			initialize();
			expect(() => initialize()).not.to.throw;
		});

	});

	describe('allowing frames', () => {
		const frame = fixture(html`<iframe srcdoc="&lt;!DOCTYPE html&gt;&lt;html&gt;&lt;head&gt;&lt;/head&gt;&lt;body&gt;&lt;/body&gt;&lt;/html&gt;"></iframe>`);

		it('throws when allowing a frame before initialization', () => {
			expect(() => allowFrame(frame)).to.throw(LmsContextProviderError);
		});

		it('throws when attempting to allow a frame that has already been allowed', () => {
			initialize();

			allowFrame(frame);
			expect(() => allowFrame(frame)).to.throw(LmsContextProviderError);
		});

	});

	describe('registering plugins', () => {

		it('throws when host has not yet been initialized', () => {
			expect(() => registerPlugin(mockContextType)).to.throw(LmsContextProviderError);
		});

		it('throws when trying to re-register an existing plugin', () => {
			initialize();
			registerPlugin(mockContextType);
			expect(() => registerPlugin(mockContextType)).to.throw(LmsContextProviderError);
		});

		it('does not throw when registering multiple different plugins', () => {
			initialize();
			registerPlugin(mockContextType);
			expect(() => registerPlugin(otherMockContextType)).not.to.throw(LmsContextProviderError);
		});

	});

	describe('framed client', () => {

		const sendFramedClientRequest = async(frame, isContextProvider, type, subscriptionMessageSpy) => {
			const message = {
				isContextProvider: isContextProvider,
				type: type,
				options: mockOpts,
				subscribe: !!subscriptionMessageSpy
			};

			return await new Promise(resolve => {
				frame.contentWindow.addEventListener('message', e => {
					if (subscriptionMessageSpy) frame.contentWindow.addEventListener('message', subscriptionMessageSpy, { once: true });
					resolve(e.data);
				}, { once: true });

				const script = frame.contentWindow.document.createElement('script');
				script.type = 'text/javascript';
				script.innerHTML = `window.parent.postMessage(${JSON.stringify(message)}, '*');`;
				frame.contentWindow.document.head.appendChild(script);
			});
		};

		const assertContextRequestMessageResponse = (messageData, expectedReturnVal, expectedType) => {
			expect(messageData.isContextProvider).to.be.true;
			expect(messageData.type).to.equal(expectedType || mockContextType);
			expect(messageData.value).to.equal(expectedReturnVal);
		};

		const assertSubscriptionMessageResponse = (messageData, expectedReturnVal) => {
			expect(messageData.isContextProvider).to.be.true;
			expect(messageData.type).to.equal(mockContextType);
			expect(messageData.changedValues).to.deep.equal(expectedReturnVal);
		};

		let mockFrame;
		beforeEach(async() => {
			initialize();
			mockFrame = await fixture(html`<iframe></iframe>`);
		});

		it('passes data through when a plugin can handle the request', async() => {
			const testVal = 'testVal';
			const tryGetStub = stub().returns(testVal);
			registerPlugin(mockContextType, tryGetStub);
			allowFrame(mockFrame, window.location.origin);

			const messageData = await sendFramedClientRequest(mockFrame, true, mockContextType);
			assertContextRequestMessageResponse(messageData, testVal);
		});

		it('returns undefined when no host plugin can handle the request', async() => {
			allowFrame(mockFrame, window.location.origin);
			const messageData = await sendFramedClientRequest(mockFrame, true, mockContextType);
			assertContextRequestMessageResponse(messageData, undefined);
		});

		it('returns is-framed response when requested, regardless of registered plugins', async() => {
			allowFrame(mockFrame, window.location.origin);

			const messageData = await sendFramedClientRequest(mockFrame, true, 'framed-request');
			assertContextRequestMessageResponse(messageData, true, 'framed-request');
		});

		it('ignores requests without isContextProvider specified', async() => {
			const testVal = 'testVal';
			const tryGetStub = stub().returns(testVal);
			registerPlugin(mockContextType, tryGetStub);
			allowFrame(mockFrame, window.location.origin);

			const messageData = await Promise.race([
				sendFramedClientRequest(mockFrame, false, mockContextType),
				aTimeout(50)
			]);
			expect(messageData).to.be.undefined;
		});

		it('ignores requests from framed clients that have not been allowed', async() => {
			const messageData = await Promise.race([
				sendFramedClientRequest(mockFrame, true, mockContextType),
				aTimeout(50)
			]);
			expect(messageData).to.be.undefined;
		});

		it('ignores requests from framed clients with an unexpected origin', async() => {
			allowFrame(mockFrame, 'someFakeOrigin');
			const messageData = await Promise.race([
				sendFramedClientRequest(mockFrame, true, mockContextType),
				aTimeout(50)
			]);
			expect(messageData).to.be.undefined;
		});

		it('sends subscription events when a client has requested a subscription', async() => {
			const testValues = {
				testVal: 'testVal',
				otherTestVal: 'otherTestVal'
			};

			const subscriptionSpy = spy();
			registerPlugin(mockContextType, undefined, subscriptionSpy);
			allowFrame(mockFrame, window.location.origin);

			const subscriptionMessageSpy = spy();
			await sendFramedClientRequest(mockFrame, true, mockContextType, subscriptionMessageSpy);
			expect(subscriptionSpy).to.have.been.calledOnce;
			expect(subscriptionSpy.args[0]).to.have.length(2);

			// Assert options argument
			expect(subscriptionSpy.args[0][1]).to.deep.equal({});

			// Trigger subscription callback in order to mimic a context change event
			subscriptionSpy.args[0][0](testValues);
			await aTimeout(50);

			expect(subscriptionMessageSpy).to.have.been.calledOnce;
			expect(subscriptionMessageSpy.args[0]).to.have.length(1);

			// Assert subscription message response
			const messageData = subscriptionMessageSpy.args[0][0].data;
			assertSubscriptionMessageResponse(messageData, testValues);
		});

		it('sends an immediate subscription event when a plugin is registered and a subscription is queued', async() => {
			const testValues = {
				testVal: 'testVal',
				otherTestVal: 'otherTestVal'
			};
			allowFrame(mockFrame, window.location.origin);

			const subscriptionMessageSpy = spy();
			await sendFramedClientRequest(mockFrame, true, mockContextType, subscriptionMessageSpy);

			// Shouldn't receive a subscription message before a host plugin has been registered.
			expect(subscriptionMessageSpy).not.to.have.been.called;

			// Register a plugin to handle this context request after it has originally been set.
			const subscriptionSpy = spy();
			registerPlugin(mockContextType, undefined, subscriptionSpy);

			expect(subscriptionSpy).to.have.been.calledOnce;
			expect(subscriptionSpy.args[0]).to.have.length(2);
			expect(subscriptionSpy.args[0][1]).to.deep.equal({ sendImmediate: true });

			subscriptionSpy.args[0][0](testValues);
			await aTimeout(50);

			expect(subscriptionMessageSpy).to.have.been.calledOnce;
			expect(subscriptionMessageSpy.args[0]).to.have.length(1);

			// Assert subscription message response
			const messageData = subscriptionMessageSpy.args[0][0].data;
			assertSubscriptionMessageResponse(messageData, testValues);
		});

		it('does not send subscription events to framed clients that have not been allowed', async() => {
			const subscriptionSpy = spy();
			registerPlugin(mockContextType, undefined, subscriptionSpy);

			const subscriptionMessageSpy = spy();
			const messageData = await Promise.race([
				sendFramedClientRequest(mockFrame, true, mockContextType, subscriptionMessageSpy),
				aTimeout(50)
			]);

			expect(messageData).to.be.undefined;
			expect(subscriptionSpy).not.to.have.been.called;
			expect(subscriptionMessageSpy).not.to.have.been.called;
		});

		it('does not send subscription events to framed clients with an unexpected origin', async() => {
			const subscriptionSpy = spy();
			registerPlugin(mockContextType, undefined, subscriptionSpy);
			allowFrame(mockFrame, 'someFakeOrigin');

			const subscriptionMessageSpy = spy();
			const messageData = await Promise.race([
				sendFramedClientRequest(mockFrame, true, mockContextType, subscriptionMessageSpy),
				aTimeout(50)
			]);

			expect(messageData).to.be.undefined;
			expect(subscriptionSpy).not.to.have.been.called;
			expect(subscriptionMessageSpy).not.to.have.been.called;
		});

	});

	describe('unframed client', () => {

		const sendNonFramedClientRequest = (type, subscriptionEventSpy) => {
			const eventDetails = {
				type: type,
				options: mockOpts,
				subscribe: !!subscriptionEventSpy
			};

			if (subscriptionEventSpy) {
				document.addEventListener('lms-context-change', e => subscriptionEventSpy(e.detail), { once: true });
			}

			const event = new CustomEvent(
				'lms-context-request', {
					detail: eventDetails
				}
			);

			document.dispatchEvent(event);
			return {
				handled: event.detail.handled,
				value: event.detail.value
			};
		};

		beforeEach(() => {
			initialize();
		});

		it('passes data through when a plugin can handle the request', () => {
			const testVal = 'testVal';
			const tryGetStub = stub().returns(testVal);
			registerPlugin(mockContextType, tryGetStub);

			const { handled, value } = sendNonFramedClientRequest(mockContextType);
			expect(handled).to.be.true;
			expect(value).to.equal(testVal);
		});

		it('returns undefined when no host plugin can handle the request', () => {
			const { handled, value } = sendNonFramedClientRequest(mockContextType);
			expect(handled).to.be.true;
			expect(value).to.be.undefined;
		});

		it('ignores requests without a type specified', async() => {
			const testVal = 'testVal';
			const tryGetStub = stub().returns(testVal);
			registerPlugin(mockContextType, tryGetStub);

			const { handled, value } = sendNonFramedClientRequest();
			expect(handled).to.be.undefined;
			expect(value).to.be.undefined;
		});

		it('sends subscription events when a client has requested a subscription', () => {
			const testValues = {
				testVal: 'testVal',
				otherTestVal: 'otherTestVal'
			};

			const subscriptionSpy = spy();
			registerPlugin(mockContextType, undefined, subscriptionSpy);

			const subscriptionEventSpy = spy();
			sendNonFramedClientRequest(mockContextType, subscriptionEventSpy);
			expect(subscriptionSpy).to.have.been.calledOnce;
			expect(subscriptionSpy.args[0]).to.have.length(2);

			// Assert options argument
			expect(subscriptionSpy.args[0][1]).to.deep.equal({});

			// Trigger subscription callback in order to mimic a context change event
			subscriptionSpy.args[0][0](testValues);

			expect(subscriptionEventSpy).to.have.been.calledOnce;
			expect(subscriptionEventSpy.args[0]).to.have.length(1);

			// Assert subscription event response
			const changedValues = subscriptionEventSpy.args[0][0].changedValues;
			expect(changedValues).to.deep.equal(testValues);
		});

		it('sends an immediate subscription event when a plugin is registered and a subscription is queued', () => {
			const testValues = {
				testVal: 'testVal',
				otherTestVal: 'otherTestVal'
			};

			const subscriptionEventSpy = spy();
			sendNonFramedClientRequest(mockContextType, subscriptionEventSpy);

			// Shouldn't receive a subscription event before a host plugin has been registered.
			expect(subscriptionEventSpy).not.to.have.been.called;

			// Register a plugin to handle this context request after it has originally been set.
			const subscriptionSpy = spy();
			registerPlugin(mockContextType, undefined, subscriptionSpy);

			expect(subscriptionSpy).to.have.been.calledOnce;
			expect(subscriptionSpy.args[0]).to.have.length(2);
			expect(subscriptionSpy.args[0][1]).to.deep.equal({ sendImmediate: true });

			subscriptionSpy.args[0][0](testValues);

			expect(subscriptionEventSpy).to.have.been.calledOnce;
			expect(subscriptionEventSpy.args[0]).to.have.length(1);

			// Assert subscription event response
			const changedValues = subscriptionEventSpy.args[0][0].changedValues;
			expect(changedValues).to.deep.equal(testValues);
		});

	});

});
