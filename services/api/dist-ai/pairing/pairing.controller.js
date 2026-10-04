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
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { Auth, CurrentPrincipal, TEACHING_ROLES } from '../auth/auth.decorators.js';
import { ZodBody } from '../common/zod-body.js';
import { PairingService } from './pairing.service.js';
const ClaimBody = z
    .object({ code: z.string().max(12).optional(), qr: z.string().max(512).optional() })
    .refine((b) => b.code || b.qr, 'Provide the code or the scanned QR');
let PairingController = class PairingController {
    constructor(pairing) {
        this.pairing = pairing;
    }
    /** Teacher App: "Connect to board" after scanning the QR or typing the code. */
    claim(p, body) {
        return this.pairing.claim(p, body);
    }
};
__decorate([
    Post('claim'),
    HttpCode(200),
    Auth('user', TEACHING_ROLES),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodBody(ClaimBody))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PairingController.prototype, "claim", null);
PairingController = __decorate([
    Controller('v1/pairing'),
    __metadata("design:paramtypes", [PairingService])
], PairingController);
export { PairingController };
//# sourceMappingURL=pairing.controller.js.map