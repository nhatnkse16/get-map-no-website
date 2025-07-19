// src/utils.js
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = (base, range = 1000) => wait(base + Math.random() * range);

module.exports = {
    wait,
    randomDelay
};