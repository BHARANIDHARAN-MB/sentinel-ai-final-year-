/**
 * A minimal in-memory stand-in for the Mongoose User model, implementing
 * just enough of the API (findOne, create, instance.save) that
 * routes/auth.js uses. This lets the auth flow be tested end-to-end
 * without a real MongoDB connection, which this sandbox can't reach
 * anyway. Swapped in via require.cache injection in the test file -
 * production code (server.js) is untouched and uses the real Mongoose
 * model normally.
 */

let store = new Map(); // email -> user record
let idCounter = 1;

function makeUserInstance(record) {
  return {
    ...record,
    save: async function () {
      store.set(this.email, { ...this });
      return this;
    },
  };
}

const MockUser = {
  async findOne({ email }) {
    const record = store.get(email);
    return record ? makeUserInstance(record) : null;
  },
  async create({ email, passwordHash, name }) {
    const record = {
      _id: { toString: () => String(idCounter++) },
      email,
      passwordHash,
      name: name || "",
      otpCode: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      lastLoginAt: null,
    };
    store.set(email, record);
    return makeUserInstance(record);
  },
  __reset() {
    store = new Map();
    idCounter = 1;
  },
  __dump() {
    return Object.fromEntries(store);
  },
};

module.exports = MockUser;
