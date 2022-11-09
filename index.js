// rtcbeam core library.
import { version } from './package.json'
import * as nacl from './nacl.min.js'
import * as naclUtil from './nacl-util.min.js'
import { v4 as uuidv4 } from 'uuid'
import * as pjs from './peerjs.min.js'

const getVersion = () => {
  // Test method.
  return version
}

const deliverFile = (conn, store) => {
  // This method will deliver a file to the client that requested it.
  //
  // conn is the peerjs connection object.
  // store is an object storing the app state.

  // Recieve connection.
  store.appStatus = '💻 Connecting to peer...'
  conn.on('open', () => {
    // Connection established to peer.
    // Serve file.
    conn.on('data', (d) => {
      const data = JSON.parse(d)
      if (data.action === 'request-file' && (data.encryptionKey && data.nonce)) {
        // Valid request for file has been recieved.
        // Deliver file.
        store.appStatus = '✉️ Delivering file to peer...'
        const file = store.outboundFile
        const mime = file.type

        // Start by reading file.
        const reader = new FileReader()
        reader.readAsArrayBuffer(file)
        reader.onload = function () {
          const b = new Blob([reader.result], { type: mime })

          // File has been read, encrypt.
          b.arrayBuffer().then(buf => {
            // Generate authentication key pair.
            const keyPair = nacl.box.keyPair()
            let message
            // Check if encryption should be skipped.
            if (data.flags.includes('no-encryption')) {
              message = new Uint8Array(buf)
            } else {
              store.appStatus = '🔐 Encrypting file...'
              message = nacl.box(
                new Uint8Array(buf),
                naclUtil.decodeBase64(data.nonce),
                naclUtil.decodeBase64(data.encryptionKey),
                keyPair.secretKey
              )
            }

            // Notify transfer starting.
            conn.send(JSON.stringify({
              action: 'notify-transfer-start',
              flags: []
            }))

            // Copy flags from request.
            const flags = data.flags
            // Send file over network.
            store.appStatus = '📡 Sending file...'
            conn.send(JSON.stringify({
              action: 'deliver-file',
              flags: flags,
              message: naclUtil.encodeBase64(message),
              authenticationKey: naclUtil.encodeBase64(keyPair.publicKey),
              metadata: {
                filename: file.name,
                type: mime
              }
            }))
          })
        }
        reader.onerror = function () {
          console.log(reader.error)
        }
      } else if (data.action === 'confirm-transfer-finish') {
        // Notify transfer completed.
        store.appStatus = '✅ File transfer completed.'
      }
    })
  })
}

const requestFile = (id, encrypt, store) => {
  // This method requests a file transfer from a peer.
  //
  // id is other peer's id.
  // encrypt is bool for yes/no encryption.
  // store is app state object.

  // Request file.
  store.appStatus = '💻 Connecting to peer...'
  const conn = store.peer.connect(id)
  conn.on('open', () => {
    // Connection established.
    store.appStatus = '❔ Requesting file...'
    // Generate encryption keys.
    const keyPair = nacl.box.keyPair()
    const nonce = nacl.randomBytes(nacl.box.nonceLength)
    // Send file request.
    const flags = []
    if (!encrypt) flags.push('no-encryption')
    conn.send(JSON.stringify({
      action: 'request-file',
      flags: flags,
      encryptionKey: naclUtil.encodeBase64(keyPair.publicKey),
      nonce: naclUtil.encodeBase64(nonce)
    }))
    // Store nonce and secrey key for decrypting reply.
    store.nonce = nonce
    store.secretKey = keyPair.secretKey

    // Data is being recieved.
    conn.on('data', (d) => {
      const data = JSON.parse(d)
      if (data.action === 'deliver-file' && data.authenticationKey && data.message) {
        // File recieved, check if decryption is needed.
        let uintArray
        if (data.flags.includes('no-encryption')) {
          uintArray = naclUtil.decodeBase64(data.message)
        } else {
          store.appStatus = '🔐 Decrypting file...'
          uintArray = nacl.box.open(
            naclUtil.decodeBase64(data.message),
            store.nonce,
            naclUtil.decodeBase64(data.authenticationKey),
            store.secretKey
          )
        }

        // Show save file button.
        const blob = new Blob([uintArray], { type: data.metadata.type })
        store.inboundFile = blob
        store.filename = data.metadata.filename
        store.fileReady = true
        store.appStatus = '✅ File transfer completed.'
        // Notify sender that transfer is done.
        conn.send(JSON.stringify({
          action: 'confirm-transfer-finish',
          flags: []
        }))
      } else if (data.action === 'notify-transfer-start') {
        // Transfer has started.
        store.appStatus = '📨 Recieving file...'
      }
    })
  })
}

const createPeer = (host = '0.peerjs.com', store) => {
  // This method creates a new peerjs peer and stores it to the provided store object.
  //
  // host is the desired peerjs server to be used.
  // store is app state object.

  // Creates a peerjs peer and saves it.
  store.appStatus = '📡 Establishing connection...'
  const peer = new pjs.peerjs.Peer('rtb-' + uuidv4(), { host: host })
  store.peer = peer
  peer.on('open', function (id) {
    store.appStatus = '✅ Connected to network.'
  })
  peer.on('error', (err) => {
    store.appStatus = '❌ An error has occured.'
    console.error(err)
  })
}

export { getVersion, deliverFile, requestFile, createPeer }
