"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lastX = lastX;
exports.returnValue = returnValue;
exports.all = all;
exports.toArray = toArray;
exports.fromArray = fromArray;
const NO_VALUE = Symbol('NO_VALUE');
async function lastX(as) {
    let lastValue = NO_VALUE;
    for await (const a of as) {
        lastValue = a;
    }
    if (lastValue === NO_VALUE) {
        throw new Error('No items in generator');
    }
    return lastValue;
}
async function returnValue(as) {
    let e;
    do {
        e = await as.next();
    } while (!e.done);
    return e.value;
}
// Run all generators concurrently up to a concurrency cap, yielding values as they come in
async function* all(generators, concurrencyCap = Infinity) {
    const next = (generator) => {
        const promise = generator
            .next()
            .then(({ done, value }) => ({
            done,
            value,
            generator,
            promise,
        }));
        return promise;
    };
    const waiting = [...generators];
    const promises = new Set();
    // Start initial batch up to concurrency cap
    while (promises.size < concurrencyCap && waiting.length > 0) {
        const gen = waiting.shift();
        promises.add(next(gen));
    }
    while (promises.size > 0) {
        const { done, value, generator, promise } = await Promise.race(promises);
        promises.delete(promise);
        if (!done) {
            promises.add(next(generator));
            // TODO: Clean this up
            if (value !== undefined) {
                yield value;
            }
        }
        else if (waiting.length > 0) {
            // Start a new generator when one finishes
            const nextGen = waiting.shift();
            promises.add(next(nextGen));
        }
    }
}
async function toArray(generator) {
    const result = [];
    for await (const a of generator) {
        result.push(a);
    }
    return result;
}
async function* fromArray(values) {
    for (const value of values) {
        yield value;
    }
}
