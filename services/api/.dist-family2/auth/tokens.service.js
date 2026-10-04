var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENV } from '../config/env.js';
const AUDIENCE = 'kinetix-api';
/**
 * HS256 for now. TODO: switch to EdDSA keys from KMS so the offline-pairing credential can be
 * verified by boards with the public key alone (see docs/architecture/board-pairing.md).
 */
let TokensService = class TokensService {
    constructor(env) {
        this.jwt = new JwtService({ secret: env.JWT_SECRET });
    }
    signUser(claims) {
        return this.jwt.sign({ ...claims, typ: 'user' }, { expiresIn: '12h', audience: AUDIENCE });
    }
    signDevice(claims) {
        return this.jwt.sign({ ...claims, typ: 'device' }, { expiresIn: '365d', audience: AUDIENCE });
    }
    signBoard(claims, expiresAt) {
        const seconds = Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
        return this.jwt.sign({ ...claims, typ: 'board' }, { expiresIn: seconds, audience: AUDIENCE });
    }
    verify(token) {
        try {
            return this.jwt.verify(token, { audience: AUDIENCE });
        }
        catch {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }
};
TokensService = __decorate([
    Injectable(),
    __param(0, Inject(ENV)),
    __metadata("design:paramtypes", [Object])
], TokensService);
export { TokensService };
//# sourceMappingURL=tokens.service.js.map