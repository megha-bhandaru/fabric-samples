'use strict';

const { Contract } = require('fabric-contract-api');

const VERIFIER_MSP = 'Org1MSP';

class AssetTransfer extends Contract {

    // Register a new identity. Only a hash of the documents is stored, never the real data.
    async registerIdentity(ctx, userId, docHash) {
        const existing = await ctx.stub.getState(userId);
        if (existing && existing.length > 0) {
            throw new Error(`Identity ${userId} already exists`);
        }
        const record = {
            userId: userId,
            docHash: docHash,
            status: 'pending',
            registeredBy: ctx.clientIdentity.getMSPID(),
            verifiedBy: '',
            consents: [],
        };
        await ctx.stub.putState(userId, Buffer.from(JSON.stringify(record)));
        return JSON.stringify(record);
    }

    // Only the verifier org can mark an identity as verified.
    async verifyIdentity(ctx, userId) {
        const caller = ctx.clientIdentity.getMSPID();
        if (caller !== VERIFIER_MSP) {
            throw new Error(`${caller} is not allowed to verify identities`);
        }
        const record = await this._load(ctx, userId);
        record.status = 'verified';
        record.verifiedBy = caller;
        await ctx.stub.putState(userId, Buffer.from(JSON.stringify(record)));
        return JSON.stringify(record);
    }

    // The home institution gives another institution permission to check status.
    async grantConsent(ctx, userId, institutionMsp) {
        const record = await this._load(ctx, userId);
        this._requireOwner(ctx, record);
        if (!record.consents.includes(institutionMsp)) {
            record.consents.push(institutionMsp);
        }
        await ctx.stub.putState(userId, Buffer.from(JSON.stringify(record)));
        return JSON.stringify(record);
    }

    // The home institution takes permission away again.
    async revokeConsent(ctx, userId, institutionMsp) {
        const record = await this._load(ctx, userId);
        this._requireOwner(ctx, record);
        record.consents = record.consents.filter((m) => m !== institutionMsp);
        await ctx.stub.putState(userId, Buffer.from(JSON.stringify(record)));
        return JSON.stringify(record);
    }

    // Returns the status only if the caller is the home institution, the verifier, or has consent.
    async checkStatus(ctx, userId) {
        const caller = ctx.clientIdentity.getMSPID();
        const record = await this._load(ctx, userId);
        const allowed = caller === record.registeredBy ||
                        caller === VERIFIER_MSP ||
                        record.consents.includes(caller);
        if (!allowed) {
            throw new Error(`${caller} has no consent to view ${userId}`);
        }
        return JSON.stringify({ userId: record.userId, status: record.status });
    }

    // ---- helpers ----
    async _load(ctx, userId) {
        const data = await ctx.stub.getState(userId);
        if (!data || data.length === 0) {
            throw new Error(`Identity ${userId} does not exist`);
        }
        return JSON.parse(data.toString());
    }

    _requireOwner(ctx, record) {
        const caller = ctx.clientIdentity.getMSPID();
        if (caller !== record.registeredBy) {
            throw new Error(`Only ${record.registeredBy} can change consent for ${record.userId}`);
        }
    }
}

module.exports = AssetTransfer;