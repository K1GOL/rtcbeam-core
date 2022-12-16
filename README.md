# rtcbeam-core
Peer-to-peer end-to-end encrypted file and data transfer module using PeerJS. Provides core functionality for [rtcbeam](https://github.com/K1GOL/rtcbeam). Can be used to send any kind of data between two peers. Designed for, but not limited to, file transfer.

---

# Usage

### **IMPORTANT NOTE**

rtcbeam-core is built with [PeerJS](https://peerjs.com/), a peer-to-peer library that (unfortunately) will not function outside of a browser. As a result, rtcbeam-core will only work if run in a browser.

# Installation

`npm i rtcbeam-core`

`import { Rtcbeam } from 'rtcbeam-core'`

## `Rtcbeam([host])`

Create a new instance of the `Rtcbeam` class with `const rtcbeam = new Rtcbeam(host)`

Parameters:
<dl>
  <dt>host <i>(optional)</i></dt>
  <dd>URL for any <a href="https://peerjs.com/">PeerServer</a> used to broker connections. Default is 0.peerjs.com</dd>
</dl>

## rtcbeam.getVersion()

Returns version number.
```javascript
console.log(rtcbeam.getVersion())
// 1.2.3
```

## rtcbeam.createPeer([host])

Creates new PeerJS peer. Can be called on an existing rtcbeam instance to reconnect to another connection broker server.

Parameters:
<dl>
  <dt>host <i>(optional)</i></dt>
  <dd>URL for any <a href="https://peerjs.com/">PeerServer</a> used to broker connections. Default is 0.peerjs.com</dd>
</dl>

Returns:

[PeerJS](https://peerjs.com/docs) peer object.

```javascript
const rtcbeam = new Rtcbeam('0.peerjs.com')
console.log(rtcbeam.peer.options.host)
// 0.peerjs.com

rtcbeam.createPeer('server.example.com')
console.log(rtcbeam.peer.options.host)
// server.example.com

const newPeer = rtcbeam.createPeer('server.example.com')
console.log(newPeer.options.host)
// server.example.com
```

## rtcbeam.serveData(blob[, name, isFile])

Serve new data from your rtcbeam client that can be requested by other clients. 

Parameters:
<dl>
  <dt>blob</dt>
  <dd>Any Javascript <a href="https://developer.mozilla.org/en-US/docs/Web/API/Blob">Blob</a> containing the data that will be served.</dd>

  <dt>name <i>(optional)</i></dt>
  <dd>Name of the data. If no name is provided, the MIME type of the blob will be used.</dd>

  <dt>isFile <i>(optional)</i></dt>
  <dd>Boolean that should be true if the served data should be interpreted as a file, false otherwise. Default is true.</dd>
</dl>

Returns:

Content ID of the served data. CID will be used by other peers to request this data.

```javascript
const cid = rtcbeam.serveData(new Blob(['Hello world!']), 'hello', false)

/* -- or -- */

const cid = rtcbeam.serveData(new Blob(['data-read-from-file']), 'file.txt', true)

console.log(cid)
// CID of served data, for example
// 9907f5ca-ee52-44ac-abc1-74e31ceb6a95
```

## rtcbeam.removeData(cid)

Removes served data and makes it no longer available.

Parameters:
<dl>
  <dt>cid</dt>
  <dd>Content ID of the data to be removed.</dd>
</dl>

```javascript
const cid = rtcbeam.serveData(new Blob(['Hello world!']))
// Served.

rtcbeam.removeData(cid)
// Gone, reduced to atoms.
```

## rtcbeam.requestData(id, cid[, encrypt])

Requests data from another client by client's ID and data CID.

Parameters:
<dl>
  <dt>id</dt>
  <dd>ID of other peer.</dd>

  <dt>cid</dt>
  <dd>Content ID of the desired data from other peer.</dd>

  <dt>encrypt <i>(optional)</i></dt>
  <dd>True for end-to-end encryption, false to skip encryption. Default is true.</dd>
</dl>

```javascript
rtcbeam.requestData('other-peer-id', 'some-cid')

rtcbeam.on('transfer-completed', (blob) => {
  blob.text().then(t => console.log(t))
  // Writes requested data as text.
})
```

## rtcbeam.createStatusMessageSet(name[, values])

Creates a new status message set with user defined status messages. These messages will be passed on to the `status` event.

Parameters:
<dl>
  <dt>name</dt>
  <dd>Name of the status message set. Cannot be "default". If one already exists with the same name, it will be overridden.</dd>

  <dt>values <i>(optional)</i></dt>
  <dd>Object containing the new status messages, see below. If a value is missing, default will be used.</dd>
</dl>

Available status messages and their default values:

`networkConnecting`: 📡 Establishing connection...

`networkConnected`: ✅ Connected to network.

`error`: ❌ An error has occured.

`peerConnecting`: 💻 Connecting to peer...

`requestingData`: ❔ Requesting file...

`encryptingData`: 🔐 Encrypting file...

`sendingData`: 📡 Sending file...

`decryptingData`: 🔐 Decrypting file...

`transferCompleted`: ✅ File transfer completed.

`receivingData`: 📨 Receiving file...

`dataNotAvailable`: ❌ File is no longer available.


```javascript
// Default behaviour:
rtcbeam.on('status', status => {
  console.log(status)
  // When connected to network: ✅ Connected to network.
  // When sending data: 📡 Sending file...
  // etc...
})

/* --- */

// With custom status messages:
// Create a new set
rtcbeam.createStatusMessageSet('newMessageSet', {
  networkConnected: 'Hello world!',
  sendingData: 'Hello world, again!'
  // Other messages that are not specified will use default values.
})
// Use the new set.
rtcbeam.statusMessageSet = 'newMessageSet'

rtcbeam.on('status', status => {
  console.log(status)
  // When connected to network: Hello world!
  // When sending data: Hello world, again!
})

// To use default messages again:
rtcbeam.statusMessageSet = 'default'
```

---

## Events:

Listen to with ```rtcbeam.on('event', (param1, param2...) => { ... })```

## .on('ready', () => { })

Emitted when rtcbeam client is ready and has connected to the provided PeerServer after initialization. Client can now be used for data transfer.

## .on('status', (status) => { })

Emitted when the app status changes.

Parameters:
<dl>
  <dt>status</dt>
  <dd>String describing the new app status.</dd>
</dl>

## .on('connection', (conn) => { })

Emitted when a new connection to this client has been established.

Parameters:
<dl>
  <dt>conn</dt>
  <dd>Incoming PeerJS connection.</dd>
</dl>

## .on('send-start', () => { })

Emitted when client has started sending data.

## .on('send-finish', () => { })

Emitted when client has finished sending data.

## .on('recieve-start', () => { })

Emitted when client has started recieving data.

## .on('transfer-completed', (blob, metadata) => { })

Emitted when client has finished recieving data.

Parameters:
<dl>
  <dt>blob</dt>
  <dd>Blob that was recieved from other client</dd>

  <dt>metadata</dt>
  <dd>Metadata about transferred data. Has the following values:

  name\
  Name of the data.

  type\
  MIME type of the data

  cid\
  Content ID of the data.

  isFile\
  True if the data should be interpreted as a file, false otherwise.

  </dd>
</dl>

## .on('not-found', (cid) => { })

Emitted when data has been requested from another peer but was not found by other peer.

Parameters:
<dl>
  <dt>cid</dt>
  <dd>Content ID of the requested data.</dd>
</dl>

---

## Values:

Various values accessible within an instance of the `Rtcbeam` class.

## .appStatus

String describing the current state of the app.

## .peer

[PeerJS peer](https://peerjs.com/docs) used by the client.

## .inboundData

Contains data being transferred to this client from others. Data structure:

```
.inboundData
│
├ .cid-of-some-data
│  ├ .body      < blob containing data
│  ├ .name      < data name
│  ├ .type      < data MIME type
│  ├ .nonce     < encryption nonce
│  └ .secretKey < encryption secret key
│
├ .cid-of-some-other-data
...
```

## .outboundData

Contains data being served by this client and that can be transferred from this client to others. Data structure:

```
.outboundData
│
├ .cid-of-some-data
│  ├ .body      < blob containing data
│  ├ .name      < data name
│  ├ .type      < data MIME type
│  ├ .nonce     < encryption nonce
│  └ .secretKey < encryption secret key
│
├ .cid-of-some-other-data
...
```

## .version

rtcbeam-core version. Identical to `.getVersion()`

## .statusMessageSet

The name of the status message set that is being used. See `.createStatusMessageSet()`. Value for default set is `default`.

## .statusMessages

This object stores different status message sets. Can be written to directly to change status messages, or to create a new message set. See `.createStatusMessageSet()`. Data structure:

```
.statusMessages
│
├ .name-of-message-set
│  ├ .networkConnecting: string
│  ├ .networkConnected: string
│  ├ .error: string
│  ...
│  └ .dataNotAvailable: string
│
├ .name-of-some-other-message-set
...
```

---

## Internal functions that are publicly accessible but are mostly useless:

## deliverData (request, conn)

Delivers data to another client.

Parameters:
<dl>
  <dt>request</dt>
  <dd>Request sent by another peer.</dd>

  <dt>conn</dt>
  <dd>PeerJS connection from other peer.</dd>
</dl>

```javascript
rtcbeam.on('connection', (conn) => {
  conn.on('data', (data) => {
    const request = JSON.parse(data)
    if (data.action === 'request-data') {
      rtcbeam.deliverData(request, conn)
    }
  })
})
```

## recieveData(data, conn)

Recieves data from other peer. Data is written to `rtcbeam.inboundData[cid]`, where cid is Content ID of transferred data. Parameters and usage are identical to `deliverData()`


## handleIncomingData(data, conn)

Handles incoming requests and responds accordingly. Parameters are identical to `deliverData()`

## confirmTransferFinish()

Called when data has been sent to other client.

## notifyTransferStart()

Called when data is being recieved from other client.

## dataNotFound(cid)

Called when data was requested but not found by other client.

Parameters:
<dl>
  <dt>cid</dt>
  <dd>Content ID of requested data.</dd>
</dl>

---

# Example

```javascript
// As noted above, bundle with Webpack, etc. and run in a browser.

import { Rtcbeam } from 'rtcbeam-core'

// Create a new client.
const firstClient = new Rtcbeam()

// Wait for client to be ready.
firstClient.on('ready', () => {
  // Create some data.
  const data = new Blob(['Hello world!'])

  // Serve that data and save cid.
  const cid = firstClient.serveData(data)

  // Create a second client to recieve that data.
  const secondClient = new Rtcbeam()
  secondClient.on('ready', () => {
    // Handle incoming data.
    secondClient.on('transfer-completed', (blob, metadata) => {
      blob.text().then(t => {
        console.log(t)
        // Hello world!
      })
    })
    // Request served data.
    secondClient.requestData(firstClient.peer.id, cid)
  })
})

```

## License
BSD 2-clause license.
