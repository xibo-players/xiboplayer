# @xiboplayer/crypto

RSA key management for Xibo Player XMR registration.

Generates RSA-1024 key pairs via the Web Crypto API for display registration with Xibo CMS. The public key is sent during `RegisterDisplay` so the CMS can associate it with the display record.

## API

### `generateRsaKeyPair()`

Generate an RSA key pair (1024-bit, RSA-OAEP/SHA-256).

```js
import { generateRsaKeyPair } from '@xiboplayer/crypto';

const { publicKeyPem, privateKeyPem } = await generateRsaKeyPair();
// publicKeyPem:  -----BEGIN PUBLIC KEY-----\nMIGf...
// privateKeyPem: -----BEGIN PRIVATE KEY-----\nMIIC...
```

Returns SPKI PEM (public) and PKCS8 PEM (private) strings compatible with PHP's `openssl_get_publickey()`.

### `isValidPemKey(pem)`

Validate that a string has correct PEM structure.

```js
import { isValidPemKey } from '@xiboplayer/crypto';

isValidPemKey(publicKeyPem);  // true
isValidPemKey('garbage');     // false
```

## Design

- **Zero runtime dependencies** -- uses only the Web Crypto API (available in browsers, Electron, and Node.js 16+)
- **RSA-1024** matches the upstream .NET player key format
- WebSocket XMR messages are plain JSON (no encryption needed) -- the key is only for CMS registration
- Key rotation is triggered by the CMS via the XMR `rekey` command

## Usage in the SDK

This package is used internally by `@xiboplayer/utils` (config) to generate and persist keys, and by `@xiboplayer/xmds` to send them during registration. You typically don't need to import it directly.

## License

AGPL-3.0-or-later
