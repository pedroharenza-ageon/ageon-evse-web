import { createHash } from 'node:crypto';

// Conteúdo sintético de teste; não é uma imagem executável para a placa.
export function firmwareFixture(version = '1.1.0', marker = 1, project = 'EVSE') {
    const body = Buffer.alloc(320);
    body[0] = 0xe9; body[1] = 1; body[3] = 0x40; body[23] = 1;
    body.writeUInt32LE(256, 28);
    body.writeUInt32LE(0xabcd5432, 32);
    body.write(version, 48); body.write(project, 80); body[300] = marker;
    return Buffer.concat([body, createHash('sha256').update(body).digest()]);
}
