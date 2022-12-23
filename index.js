import { version } from './version.js'
import nacl from 'tweetnacl'
import naclUtil from 'tweetnacl-util'
import { v4 as uuidv4 } from 'uuid'
import { Peer } from 'peerjs'
import { EventEmitter } from 'events'

const Rtcbeam = class extends EventEmitter {
  constructor (host) {
    super()
    this.appStatus = ''
    this.inboundData = { }
    this.outboundData = { }
    this.version = version
    this.statusMessageSet = 'default'
    this.statusMessages = {
      default: {
        networkConnecting: '📡 Establishing connection...',
        networkConnected: '✅ Connected to network.',
        error: '❌ An error has occured.',
        peerConnecting: '💻 Connecting to peer...',
        requestingData: '❔ Requesting file...',
        encryptingData: '🔐 Encrypting file...',
        sendingData: '📡 Sending file...',
        decryptingData: '🔐 Decrypting file...',
        transferCompleted: '✅ File transfer completed.',
        receivingData: '📨 Receiving file...',
        dataNotAvailable: '❌ File is no longer available.'
      }
    }
    this.peer = this.createPeer(host)
  }

  getVersion () {
    return this.version
  }

  createPeer (host = '0.peerjs.com', options) {
    if (typeof host !== 'string') throw new Error(`createPeer() must be called with a parameter that has a type of string, not ${typeof host}.`)
    // This method creates a new peerjs peer and stores it to the provided store object.
    //
    // host is the desired peerjs server to be used.
    // options will be passed to PeerJS.

    // Check if options were provided
    if (!options) options = { }
    options.host = host

    // Creates a peerjs peer and returns it.
    this.appStatus = this.statusMessages[this.statusMessageSet].networkConnecting
    this.emit('status', this.appStatus)
    const peer = new Peer('rtb-' + uuidv4(), options)
    peer.on('open', () => {
      this.appStatus = this.statusMessages[this.statusMessageSet].networkConnected
      this.emit('status', this.appStatus)
      this.emit('ready')
    })
    peer.on('error', (err) => {
      this.appStatus = this.statusMessages[this.statusMessageSet].error
      this.emit('status', this.appStatus)
      console.error(err)
    })

    peer.on('connection', (conn) => {
      // Handle new incoming connections.
      this.appStatus = this.statusMessages[this.statusMessageSet].peerConnecting
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

    // Name the data if no name was provided. Default name is data MIME type. Fallback is application/octet-stream.
    if (!name) name = blob.type ? blob.type : 'application/octet-stream'
    // Type check.
    if (!(blob instanceof Blob)) throw new Error('serveData() must be called with a parameter \'blob\' that is a Blob.') // eslint-disable-line no-undef
    if (typeof name !== 'string') throw new Error(`serveData() must be called with a parameter 'name' that has a type of string, not ${typeof name}.`)
    if (typeof isFile !== 'boolean') throw new Error(`serveData() must be called with a parameter 'isFile' that has a type of boolean, not ${typeof isFile}.`)

    const cid = uuidv4()
    this.outboundData[cid] = {
      body: blob,
      cid,
      name,
      type: blob.type,
      isFile
    }
    return cid
  }

  removeData (cid) {
    // Removes served data by cid.
    if (typeof cid !== 'string') throw new Error(`removeData() must be called with a parameter 'cid' that has a type of string, not ${typeof cid}.`)
    if (this.outboundData[cid]) delete this.outboundData[cid]
  }

  requestData (id, cid, encrypt = true) {
    // This method requests a data transfer from a peer.
    //
    // id is other peer's id.
    // cid is content id of the content that will be requested.
    // encrypt is bool for yes/no encryption.

    if (typeof id !== 'string') throw new Error(`requestData() must be called with a parameter 'id' that has a type of string, not ${typeof id}.`)
    if (typeof cid !== 'string') throw new Error(`requestData() must be called with a parameter 'cid' that has a type of string, not ${typeof cid}.`)
    if (typeof encrypt !== 'boolean') throw new Error(`requestData() must be called with a parameter 'encrypt' that has a type of boolean, not ${typeof encrypt}.`)

    // Request data.
    this.appStatus = this.statusMessages[this.statusMessageSet].peerConnecting
    this.emit('status', this.appStatus)
    const conn = this.peer.connect(id, { reliable: true })
    conn.on('open', () => {
      // Connection established.
      this.appStatus = this.statusMessages[this.statusMessageSet].requestingData
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
        cid,
        flags,
        encryptionKey: naclUtil.encodeBase64(keyPair.publicKey),
        nonce: naclUtil.encodeBase64(nonce)
      }))
      // Store nonce and secrey key for decrypting reply.
      this.inboundData[cid] = {
        nonce,
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
    // Request for data has been received.
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
        this.appStatus = this.statusMessages[this.statusMessageSet].encryptingData
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

      // Start sending progress tracking information.
      const interval = setInterval(() => {
        const progress = conn.dataChannel.bufferedAmount
        conn.send(JSON.stringify({
          action: 'progress',
          progress,
          cid: request.cid
        }))
        this.emit('send-progress', progress, request.cid)
        // Stop sending progress tracking information when transfer is done.
        if (progress <= 0) clearInterval(interval)
      }, 1)

      // Send data over network.
      this.appStatus = this.statusMessages[this.statusMessageSet].sendingData
      this.emit('status', this.appStatus)
      conn.send(JSON.stringify({
        action: 'deliver-data',
        flags,
        message: naclUtil.encodeBase64(message),
        authenticationKey: naclUtil.encodeBase64(keyPair.publicKey),
        metadata: {
          name: isFile ? this.outboundData[request.cid].name : 'application/octet-stream',
          type: mime,
          cid: request.cid,
          isFile
        }
      }))
    })
  }

  receiveData (data, conn) {
    // This function handles recieving a data transfer.
    // data is incoming message.
    // conn is peerjs connection.
    // Data received, check if decryption is needed.
    let uintArray
    if (data.flags.includes('no-encryption')) {
      uintArray = naclUtil.decodeBase64(data.message)
    } else {
      this.appStatus = this.statusMessages[this.statusMessageSet].decryptingData
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
    const blob = new Blob([uintArray], blobOptions) // eslint-disable-line no-undef
    this.inboundData[data.metadata.cid].body = blob
    this.inboundData[data.metadata.cid].name = data.metadata.name
    this.appStatus = this.statusMessages[this.statusMessageSet].transferCompleted
    this.emit('status', this.appStatus)
    // Notify sender that transfer is done.
    conn.send(JSON.stringify({
      action: 'confirm-transfer-finish',
      flags: []
    }))
    this.emit('transfer-completed', blob, data.metadata)
  }

  handleIncomingData (data, conn) {
    // This function handles all incoming requests.
    // receive connection.
    if (data.action === 'deliver-data' && data.authenticationKey && data.message) {
      this.receiveData(data, conn)
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
    } else if (data.action === 'progress') {
      this.emit('receive-progress', data.progress, data.cid)
    }
  }

  confirmTransferFinish () {
    this.appStatus = this.statusMessages[this.statusMessageSet].transferCompleted
    this.emit('status', this.appStatus)
    this.emit('send-finish')
  }

  notifyTransferStart () {
    this.appStatus = this.statusMessages[this.statusMessageSet].receivingData
    this.emit('status', this.appStatus)
    this.emit('receive-start')
  }

  dataNotFound (cid) {
    this.appStatus = this.statusMessages[this.statusMessageSet].dataNotAvailable
    this.emit('status', this.appStatus)
    this.emit('not-found', cid)
  }

  createStatusMessageSet (name, values) {
    if (!name) throw new Error('A name must be provided for a status message set.')
    if (name === 'default') throw new Error('A new status message set cannot be called default.')
    if (typeof name !== 'string') throw new Error(`createStatusMessageSet() must be called with a parameter 'name' that has a type of string, not ${typeof name}`)
    // Creates a new status message set and assigns values to it.
    // Create new set with default messages.
    this.statusMessages[name] = this.statusMessages.default
    // Assign new messages.
    for (const [key, value] of Object.entries(values)) {
      this.statusMessages[name][key] = value
    }
  }
}

export { Rtcbeam }
