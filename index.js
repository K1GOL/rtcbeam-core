import { version } from './version.js'
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { v4 as uuidv4 } from 'uuid'
import { Peer } from 'peerjs'
import { EventEmitter } from 'events'

const Rtcbeam = class extends EventEmitter {
  constructor (host) {
    super()
    this.appStatus = '',
    this.peer = this.createPeer(host),
    this.inboundData = { },
    this.outboundData = { },
    this.version = version
  }

  getVersion () {
    return this.version
  }

  createPeer (host = '0.peerjs.com') {
    // This method creates a new peerjs peer and stores it to the provided store object.
    //
    // host is the desired peerjs server to be used.
  
    // Creates a peerjs peer and returns it.
    this.appStatus = '📡 Establishing connection...'
    this.emit('status', this.appStatus)
    const peer = new Peer('rtb-' + uuidv4(), { host: host })
    peer.on('open', () => {
      this.appStatus = '✅ Connected to network.'
      this.emit('status', this.appStatus)
      this.emit('ready')
    })
    peer.on('error', (err) => {
      this.appStatus = '❌ An error has occured.'
      this.emit('status', this.appStatus)
      console.error(err)
    })

    peer.on('connection', (conn) => {
      // Handle new incoming connections.
      this.appStatus = '💻 Connecting to peer...'
      this.emit('status', this.appStatus)
      this.emit('connection', conn)
      conn.on('data', d => {
        const data = JSON.parse(d)
        this.handleIncomingData(data, conn)
      })
    })
  
    return peer
  }

  serveData (blob, name, isFile = true) {
    // This method adds data to be served to the rtcbeam client.
    //
    // blob is the data to be served.
    // name is name of data.
    // isFile is false if the data served is not a file.
    // Returns content id of the served data.
    // Type check.
    if (typeof blob !== typeof new Blob()) throw new Error(`serveData() must be called with a parameter that has a type of ${typeof new Blob}, not ${typeof blob}.`)
    // Name the data if no name was provided. Default name is data MIME type.
    if (!name) name = blob.type ? blob.type : 'application/octet-stream'
    
    const cid = uuidv4()
    this.outboundData[cid] = {
      body: blob,
      cid: cid,
      name: name,
      type: blob.type,
      isFile: isFile
    }
    return cid
  }

  removeData (cid) {
    // Removes served data by cid.
    if(this.outboundData[cid]) delete this.outboundData[cid]
  }

  requestData (id, cid, encrypt = true) {
    // This method requests a data transfer from a peer.
    //
    // id is other peer's id.
    // cid is content id of the content that will be requested.
    // encrypt is bool for yes/no encryption.
  
    // Request data.
    this.appStatus = '💻 Connecting to peer...'
    this.emit('status', this.appStatus)
    const conn = this.peer.connect(id)
    conn.on('open', () => {
      // Connection established.
      this.appStatus = '❔ Requesting file...'
      this.emit('status', this.appStatus)
      // Handle data sent back on same connection.
      conn.on('data', (d) => {
        const data = JSON.parse(d)
        this.handleIncomingData(data, conn)
      })
      // Generate encryption keys.
      const keyPair = nacl.box.keyPair()
      const nonce = nacl.randomBytes(nacl.box.nonceLength)
      // Send data request.
      const flags = []
      if (!encrypt) flags.push('no-encryption')
      conn.send(JSON.stringify({
        action: 'request-data',
        cid: cid,
        flags: flags,
        encryptionKey: naclUtil.encodeBase64(keyPair.publicKey),
        nonce: naclUtil.encodeBase64(nonce)
      }))
      // Store nonce and secrey key for decrypting reply.
      this.inboundData[cid] = {
        nonce: nonce,
        secretKey: keyPair.secretKey,
        body: null,
        name: null,
        type: null
      }
    })
  }

  deliverData (request, conn) {
    // This method will deliver a data to the client that requested it.
    //
    // request is the original request from other peer.
    // conn is the peerjs connection object.
    // Request for data has been recieved.
    // Check that data exists.
    if (!this.outboundData[request.cid]) {
      // Did not exist.
      conn.send(JSON.stringify({
        action: 'data-not-found',
        cid: request.cid,
        flags: []
      }))
      conn.close()
      return
    }

    // Deliver data.
    this.appStatus = '✉️ Delivering file to peer...'
    this.emit('status', this.appStatus)
    const data = this.outboundData[request.cid].body
    const isFile = this.outboundData[request.cid].isFile
    const mime = isFile ? this.outboundData[request.cid].type : 'application/octet-stream'

    // Read blob as array buffer.
    data.arrayBuffer().then(buf => {
      // Generate authentication key pair.
      const keyPair = nacl.box.keyPair()
      let message
      // Check if encryption should be skipped.
      if (request.flags.includes('no-encryption')) {
        message = new Uint8Array(buf)
      } else {
        this.appStatus = '🔐 Encrypting file...'
        this.emit('status', this.appStatus)
        message = nacl.box(
          new Uint8Array(buf),
          naclUtil.decodeBase64(request.nonce),
          naclUtil.decodeBase64(request.encryptionKey),
          keyPair.secretKey
        )
      }

      // Notify transfer starting.
      conn.send(JSON.stringify({
        action: 'notify-transfer-start',
        flags: []
      }))
      this.emit('send-start')

      // Copy flags from request.
      const flags = request.flags
      // Append not-file if not file.
      if (!isFile) flags.push('not-file')
      // Send data over network.
      this.appStatus = '📡 Sending file...'
      this.emit('status', this.appStatus)
      conn.send(JSON.stringify({
        action: 'deliver-data',
        flags: flags,
        message: naclUtil.encodeBase64(message),
        authenticationKey: naclUtil.encodeBase64(keyPair.publicKey),
        metadata: {
          name: isFile ? data.name : 'application/octet-stream',
          type: mime,
          cid: request.cid,
          isFile: isFile
        }
      }))
    })
  }

  recieveData (data, conn) {
    // This function handles recieving a data transfer.
    // data is incoming message.
    // conn is peerjs connection.
    // Data recieved, check if decryption is needed.
    let uintArray
    if (data.flags.includes('no-encryption')) {
      uintArray = naclUtil.decodeBase64(data.message)
    } else {
      this.appStatus = '🔐 Decrypting file...'
      this.emit('status', this.appStatus)
      uintArray = nacl.box.open(
        naclUtil.decodeBase64(data.message),
        this.inboundData[data.metadata.cid].nonce,
        naclUtil.decodeBase64(data.authenticationKey),
        this.inboundData[data.metadata.cid].secretKey
      )
    }

    // Data ready.
    // application/octet-stream is used for raw data, otherwise MIME type of file is specified.
    const blobOptions = data.metadata.type === 'application/octet-stream' ? { } : { type: data.metadata.type }
    const blob = new Blob([uintArray], blobOptions)
    this.inboundData[data.metadata.cid].body = blob
    this.inboundData[data.metadata.cid].name = data.metadata.name
    this.appStatus = '✅ File transfer completed.'
    this.emit('status', this.appStatus)
    // Notify sender that transfer is done.
    conn.send(JSON.stringify({
      action: 'confirm-transfer-finish',
      flags: []
    }))
    this.emit('transfer-completed', blob, data.metadata)
    // Disconnect from peer.
    conn.close()
  }

  handleIncomingData (data, conn) {
    // This function handles all incoming requests.
    // Recieve connection.    
    if (data.action === 'deliver-data' && data.authenticationKey && data.message) {
      this.recieveData(data, conn)
    } else if (data.action === 'notify-transfer-start') {
      // Transfer has started.
      this.notifyTransferStart()
    } else if (data.action === 'request-data' && (data.encryptionKey && data.nonce)) {
      this.deliverData(data, conn)
    } else if (data.action === 'confirm-transfer-finish') {
      // Notify transfer completed.
      this.confirmTransferFinish()
      // Disconnect from peer.
      conn.close()
    } else if (data.action === 'data-not-found') {
      this.dataNotFound(data.cid)
    }
  }

  confirmTransferFinish () {
    this.appStatus = '✅ File transfer completed.'
    this.emit('status', this.appStatus)
    this.emit('send-finish')
  }

  notifyTransferStart () {
    this.appStatus = '📨 Recieving file...'
    this.emit('status', this.appStatus)
    this.emit('recieve-start')
  }

  dataNotFound (cid) {
    this.appStatus = '❌ File is no longer available.'
    this.emit('status', this.appStatus)
    this.emit('not-found', cid)
  }
}

export { Rtcbeam }
