import { expect, } from '@brightspace-ui/testing';
import { LmsContextProviderError } from '../src/error.js';

describe('lms-context-provider error', () => {

	it('sets a custom name', () => {
		const err = new LmsContextProviderError();
		expect(err.name).to.equal('LmsContextProviderError');
	});

	it('extends the generic Error class', () => {
		const err = new LmsContextProviderError();
		expect(err).to.be.an.instanceof(Error);
	});

	it('pre-pends an identifier to the beginning of the provided error message', () => {
		const message = 'message';
		const err = new LmsContextProviderError(message);

		const errParts = err.message.split(' ');
		expect(errParts).to.have.length(2);

		expect(errParts[0]).to.equal('lms-context-provider:');
		expect(errParts[1]).to.equal(message);
	});

});
