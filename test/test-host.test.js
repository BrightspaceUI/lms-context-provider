import { addContext, addFrame, clear, modifyContext } from '../src/test-helpers/test-host.js';
import { restore, spy } from 'sinon';
import { contextHostMockWrapper } from '../src/host/host-internal.js';
import { expect } from '@brightspace-ui/testing';

const testContext = { test: 'context' };
const testContextName = 'test-context';

describe('lms-context-provider test-host', () => {

	beforeEach(() => {
		clear();
		restore();
	});

	describe('add context', () => {

		it('initializes the host when adding context', () => {
			const hostSpy = spy(contextHostMockWrapper, 'initialize');

			addContext();
			expect(hostSpy).to.have.been.calledOnceWithExactly();
		});

		it('registers a plugin with the host', () => {
			const hostSpy = spy(contextHostMockWrapper, 'registerPlugin');

			addContext(testContextName, testContext);
			expect(hostSpy).to.have.been.calledOnce;
			expect(hostSpy.args[0]).to.have.length(3);

			// Verify registerPlugin arguments
			expect(hostSpy.args[0][0]).to.equal(testContextName);

			// Verify tryGetCallback
			const tryGetCallback = hostSpy.args[0][1];
			const returnedContext = tryGetCallback();
			expect(returnedContext).to.deep.equal(testContext);

			// Verify subscriptionCallback
			const subscriptionSpy = spy();
			const subscriptionCallback = hostSpy.args[0][2];
			subscriptionCallback(subscriptionSpy);

			// Subscription callback shouldn't be executed without sendImmediate set
			expect(subscriptionSpy).not.to.have.been.called;
		});

		it('registers a plugin that handles queued subscription requests', () => {
			const hostSpy = spy(contextHostMockWrapper, 'registerPlugin');

			addContext(testContextName, testContext);

			// Verify subscriptionCallback
			const subscriptionSpy = spy();
			const subscriptionCallback = hostSpy.args[0][2];
			subscriptionCallback(subscriptionSpy, { sendImmediate: true });

			// Subscription callback should be executed when sendImmediate is set.
			expect(subscriptionSpy).to.have.been.calledOnceWithExactly(testContext);
		});

	});

	describe('modify context', () => {

		const newContext = { otherTest: 'otherContext' };

		it('modifies context on the host', () => {
			const hostSpy = spy(contextHostMockWrapper, 'registerPlugin');
			addContext(testContextName, testContext);

			modifyContext(testContextName, newContext);

			// Verify tryGetCallback returns new context
			const tryGetCallback = hostSpy.args[0][1];
			const returnedContext = tryGetCallback();
			expect(returnedContext).to.deep.equal(newContext);
		});

		it('sends subscription events from the host when context is modified', () => {
			const hostSpy = spy(contextHostMockWrapper, 'registerPlugin');
			addContext(testContextName, testContext);

			// Set subscription callback
			const subscriptionSpy = spy();
			const subscriptionCallback = hostSpy.args[0][2];
			subscriptionCallback(subscriptionSpy);

			modifyContext(testContextName, newContext);

			// Verify subscription callback was called
			expect(subscriptionSpy).to.have.been.calledOnceWithExactly(newContext);
		});

	});

	describe('add frame', () => {

		it('initializes the host when adding a frame', () => {
			const hostSpy = spy(contextHostMockWrapper, 'initialize');

			addFrame();
			expect(hostSpy).to.have.been.calledOnceWithExactly();
		});

		it('allows the frame on the host', () => {
			const testFrame = 'frame';
			const testOrigin = 'origin';
			const hostSpy = spy(contextHostMockWrapper, 'allowFrame');

			addFrame(testFrame, testOrigin);
			expect(hostSpy).to.have.been.calledOnceWithExactly(testFrame, testOrigin);
		});

	});

	describe('clear', () => {

		it('clears the host', () => {
			const hostSpy = spy(contextHostMockWrapper, 'reset');
			clear();
			expect(hostSpy).to.have.been.calledOnceWithExactly();
		});

	});

});
