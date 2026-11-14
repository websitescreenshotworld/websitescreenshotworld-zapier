/* globals describe, it, expect */
'use strict';

const { verifySignature, rawHeader } = require('../lib/signature');
const vectors = require('./webhook-vectors.json');

// The same cases every Website Screenshot World client library is tested against (spec repo, webhook-vectors.json).
describe('verifySignature', () => {
  for (const testCase of vectors.cases) {
    it(`agrees with the shared vector "${testCase.name}"`, () => {
      const result = verifySignature(
        testCase.header,
        testCase.body,
        testCase.secret || vectors.secret,
        testCase.tolerance || 300,
        testCase.now,
      );
      expect(result.valid).toBe(testCase.valid);
    });
  }

  it('reads the header the way Zapier names it in rawRequest', () => {
    expect(rawHeader({ headers: { 'Http-X-Wsw-Signature': 'x' } }, 'X-Wsw-Signature')).toBe('x');
    expect(rawHeader({ headers: { 'x-wsw-signature': 'y' } }, 'X-Wsw-Signature')).toBe('y');
    expect(rawHeader({}, 'X-Wsw-Signature')).toBeUndefined();
  });
});
