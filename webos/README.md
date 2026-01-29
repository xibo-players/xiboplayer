# webOS Player

webOS wrapper for the Xibo PWA player core + Node.js XMR service.

## Architecture

```
webOS Application (Cordova)
    ↓ loads
PWA core (HTML/JS)
    ↓ Socket.IO
Node.js XMR Service
    ↓ ZeroMQ
XMR Server (CMS)
```

## Components

### 1. Web Application

Lives in `app/`:
- Loads `../core/` PWA files
- `appinfo.json` — webOS app metadata
- `index.html` — Entry point (loads core PWA)

### 2. XMR Service

Lives in `service/`:
- `xmrservice.js` — Node.js service entry point
- `ZmqClient.js` — ZMTP v3 protocol (copy from reference)
- `rc4.js` — RC4 cipher
- `xmrclient.js` — RSA + RC4 decryption
- `services.json` — webOS service descriptor

### 3. Build Configuration

- `ares-package` — Package as IPK
- `ares-install` — Install to TV
- `ares-launch` — Launch app

## Directory Structure

```
webos/
├── app/
│   ├── appinfo.json           — App metadata
│   ├── index.html             — Loads ../core/index.html
│   └── assets/                — Symlink to ../core/
├── service/
│   ├── xmrservice.js          — Node.js XMR service
│   ├── ZmqClient.js           — ZMTP v3 (from reference/webos-client/)
│   ├── rc4.js                 — RC4 cipher
│   ├── xmrclient.js           — RSA + RC4
│   ├── package.json           — Service dependencies
│   └── services.json          — Service descriptor
└── README.md
```

## appinfo.json

```json
{
  "id": "com.tecman.xibo",
  "version": "0.1.0",
  "vendor": "TecMan",
  "type": "web",
  "main": "index.html",
  "title": "Xibo Player",
  "icon": "icon.png",
  "largeIcon": "icon-large.png"
}
```

## Building

```bash
# Install webOS CLI tools
npm install -g @webosose/ares-cli

# Package IPK
ares-package webos/

# Install to TV
ares-install --device tv com.tecman.xibo_0.1.0_all.ipk

# Launch
ares-launch --device tv com.tecman.xibo
```

## XMR Service Notes

The Node.js service runs separately from the web app and communicates via Socket.IO on localhost. This is necessary because:
- WebView can't use native ZeroMQ
- Node.js has full access to sockets and crypto

The service files can be copied directly from `../xibo_players_docs/reference/webos-client/`.

## TODO

- [ ] Create appinfo.json
- [ ] Create service descriptor
- [ ] Copy XMR service files from reference
- [ ] Set up ares-cli build
- [ ] Test on LG TV
