'use strict';

var assert = require('assert'),
    Q = require('q'),
    api = require('./../functionalTest/api/api'),
    client = require('./../functionalTest/api/http/baseHttpClient').create('http'),
    promiseIt = require('./../functionalTest/testHelpers').promiseIt,
    port = api.port + 1,
    mb = require('../functionalTest/mb').create(port + 1);

function getMemoryUsedForOneHundredThousandRequests (mbPort) {
    var stub = { responses: [{ is: { statusCode: 400 } }] },
        request = { protocol: 'http', port: port, stubs: [stub] },
        requestFn = function () { return client.get('/', port);},
        allRequests = [],
        originalProcess;

    // I run out of memory in the test process with 1,000,000
    for (var i = 0; i < 100000; i++) {
        allRequests[i] = requestFn;
    }

    return client.post('/imposters', request, mbPort).then(function (response) {
        assert.strictEqual(response.statusCode, 201);
        return client.get('/config', mbPort);
    }).then(function (response) {
        originalProcess = response.body.process;

        // Using Q.all above 10,000 requests gives me an ETIMEDOUT
        return allRequests.reduce(Q.when, Q(true));
    }).then(function () {
        return client.get('/config', mbPort);
    }).then(function (response) {
        return (response.body.process.rss - originalProcess.rss) / 1000000;
    }).finally(function () {
        return client.del('/imposters/' + port, mbPort);
    });
}

describe('mb', function () {
    this.timeout(300000);

    describe('when remembering requests', function () {
        promiseIt('should increase memory usage with number of requests', function () {
            return mb.start().then(function () {
                return getMemoryUsedForOneHundredThousandRequests(mb.port);
            }).then(function (memoryUsed) {
                console.log('default memory usage for 100,000 requests: ' + memoryUsed);
                assert.ok(memoryUsed > 300, 'Memory used: ' + memoryUsed);
            }).finally(function () {
                return mb.stop();
            });
        });
    });

    describe('when not remembering requests', function () {
        promiseIt('should not leak memory', function () {
            return mb.start(['--nomock']).then(function () {
                return getMemoryUsedForOneHundredThousandRequests(mb.port);
            }).then(function (memoryUsed) {
                console.log('memory with --nomock for 100,000 requests: ' + memoryUsed);
                assert.ok(memoryUsed < 50, 'Memory used: ' + memoryUsed);
            }).finally(function () {
                return mb.stop();
            });
        });
    });
});
