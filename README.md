# rtcbeam-core
Module providing core functionality for [rtcbeam](https://github.com/K1GOL/rtcbeam). Can be used for creating other apps compatible with rtcbeam.

---

## Usage

### **IMPORTANT NOTE**

rtcbeam-core is built with [PeerJS](https://peerjs.com/), a peer-to-peer library that (unfortunately) will not function outside of a browser. As a result, rtcbeam-core will only work if run in a browser.

### `getVersion()`

Returns module version.

### `requestFile(id, encrypt, store)`

Request a file from another peer. All peers are currently able to serve one file at a time.

`id`: PeerJS ID of other peer.

`encrypt`: True/false for if the transfer should be end-to-end encrypted.

`store`: App state object. (See `getNewStore()`)

### `deliverFile(conn, store)`

Delivers served file to a peer that has requested it.

`conn`: Incoming PeerJs connection from other peer.

`store`: App state object. (See `getNewStore()`)

### `createPeer(store[, host])`

Creates a new [PeerJS peer](https://peerjs.com/docs/). Returns created peer. (Peer is also stored in `store.peer`.)

`store`: App state object. (See `getNewStore()`)

`host` (Optional): PeerJS PeerServer to be used. Default is `0.peerjs.com`.

### `getNewStore()`

Returns a new app state object, that stores all required values for a client. Store the returned object and pass to functions as the `store` value.

Returned object has the following values:

`appStatus`: String, that describes the current status of the app.

`peer`: PeerJS peer used by the client. See PeerJs documentation for more information. Modify this to configure the client to use different PeerJS settings.

`outboundFile`: Blob where the file being served by this client is stored.

`version`: rtcbeam-core version.

These values are best used with reactive JS frameworks to display information about file transfers to the user as it changes:

`fileReady`: Boolean indicating if an incoming file transfer is done.

`inboundFile`: Blob that stores the file being recieved from another peer.

`filename`: Stores the filename of the incoming file.

End-to-end encryption related values:

`nonce`: E2E encryption nonce.

`secretKey`: E2E encryption secret key.

---

## Example code

```
// As noted above, bundle with Webpack, etc. and run in a browser.

import * as rtcbeam from 'rtcbeam-core'

// Create store.
const store = rtcbeam.getNewStore()

// Create peer.
const peer = rtcbeam.createPeer(store)
// See PeerJS docs for peer usage guide:
// https://peerjs.com/docs/
peer.on('open', () => {
  console.log(`Connected to PeerJS network! My peer id is: ${peer.id}`)

  // Client is now ready, and data can be transfered.
  // This is how we host some data, for example a file read to a blob: Write it to store.outboundFile.
  const data = new Blob(['Hello world!'])
  store.outboundFile = data;

  // Let's create a second peer with its own store, so we can request the data we just served from ourselves.
  const store2 = rtcbeam.getNewStore()
  const peer2 = rtcbeam.createPeer(store2)
  peer2.on('open', () => {
    // Send the data request from the second peer (by passing store2 as the store) to the first peer (by passing peer.id as the id).
    rtcbeam.requestFile(peer.id, true, store2);
    // Handle response.
    // Data transfer request is complete once store.fileReady is true.
    const interval = setInterval(() => {
      if (store2.fileReady) {
        store2.inboundFile.text().then((text) => console.log(`Data recieved: ${text}`))
        clearInterval(interval);
      }
    }, 100)
  })
})

// Handle the data request.
peer.on('connection', (conn) => {
  rtcbeam.deliverFile(conn, store)
})
// Note:
// rtcbeam-core is designed to be used with a reactive JS front-end framework that will react to the value changing. This will probably change in the future. Unfortunately right now using rtcbeam-core might require a decent amount of mental gymnastics.
```

---

## License
BSD 2-clause license.