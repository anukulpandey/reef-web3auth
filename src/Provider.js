/* eslint-disable @typescript-eslint/no-unused-vars */
import { options } from '@reef-defi/api';
import { isHexString } from '@ethersproject/bytes';
import { resolveProperties } from '@ethersproject/properties';
import { BigNumber } from '@ethersproject/bignumber';
import { Logger } from '@ethersproject/logger';
import Scanner from '@open-web3/scanner';
import { ApiPromise } from '@polkadot/api';
import {
  hexToU8a,
  isHex,
  isNumber,
  numberToHex,
  u8aConcat,
  u8aFixLength
} from '@polkadot/util';
import { encodeAddress } from '@polkadot/util-crypto';
import { resolveAddress, resolveEvmAddress, toBN } from './utils';

const logger = new Logger('evm-provider');

class Provider {
  constructor(_apiOptions, dataProvider) {
    const apiOptions = options(_apiOptions);

    this.api = new ApiPromise(apiOptions);

    this.resolveApi = this.api.isReady;
    this._isProvider = true;

    this.dataProvider = dataProvider;
    this.scanner = new Scanner({
      wsProvider: apiOptions.provider,
      types: apiOptions.types,
      typesAlias: apiOptions.typesAlias,
      typesSpec: apiOptions.typesSpec,
      typesChain: apiOptions.typesChain,
      typesBundle: apiOptions.typesBundle
    });
  }

  static isProvider(value) {
    return !!(value && value._isProvider);
  }

  async init() {
    await this.api.isReady;
    this.dataProvider && (await this.dataProvider.init());
  }

  async getNetwork() {
    await this.resolveApi;

    return {
      name: this.api.runtimeVersion.specName.toString(),
      chainId: 13939
    };
  }

  async getBlockNumber() {
    await this.resolveApi;

    const r = await this.api.rpc.chain.getHeader();

    return r.number.toNumber();
  }

  async getGasPrice() {
    // return logger.throwError(`Unsupport getGasPrice`);
    return BigNumber.from(0);
  }

  async getFeeData() {
    return {
      maxFeePerGas: BigNumber.from(1),
      maxPriorityFeePerGas: BigNumber.from(1),
      gasPrice: BigNumber.from(1)
    };
  }

  async getBalance(addressOrName, blockTag) {
    await this.resolveApi;

    let address = await resolveAddress(this, addressOrName);

    if (!address) {
      address = await this._toAddress(addressOrName);
    }

    const blockHash = await this._resolveBlockHash(blockTag);

    const accountInfo = blockHash
      ? await this.api.query.system.account.at(blockHash, address)
      : await this.api.query.system.account(address);

    return BigNumber.from(accountInfo.data.free.toBn().toString());
  }

  async getTransactionCount(addressOrName, blockTag) {
    await this.resolveApi;

    const resolvedBlockTag = await blockTag;

    const address = await resolveEvmAddress(this, addressOrName);

    let account;

    if (resolvedBlockTag === 'pending') {
      account = await this.api.query.evm.accounts(address);
    } else {
      const blockHash = await this._resolveBlockHash(blockTag);

      account = blockHash
        ? await this.api.query.evm.accounts.at(blockHash, address)
        : await this.api.query.evm.accounts(address);
    }

    if (!account.isNone) {
      return account.unwrap().nonce.toNumber();
    } else {
      return 0;
    }
  }

  async getCode(addressOrName, blockTag) {
    await this.resolveApi;

    const { address, blockHash } = await resolveProperties({
      address: resolveEvmAddress(this, addressOrName),
      blockHash: this._getBlockTag(blockTag)
    });

    const contractInfo = await this.queryContractInfo(address, blockHash);

    if (contractInfo.isNone) {
      return '0x';
    }

    const codeHash = contractInfo.unwrap().codeHash;
    const api = await (blockHash ? this.api.at(blockHash) : this.api);
    const code = await api.query.evm.codes(codeHash);

    return code.toHex();
  }

  async _getBlockTag(blockTag) {
    blockTag = await blockTag;

    if (blockTag === undefined) {
      blockTag = 'latest';
    }

    switch (blockTag) {
      case 'pending': {
        return logger.throwError(
          'pending tag not implemented',
          Logger.errors.UNSUPPORTED_OPERATION
        );
      }
      case 'latest': {
        const hash = await this.api.rpc.chain.getBlockHash();
        return hash.toHex();
      }
      case 'earliest': {
        const hash = this.api.genesisHash;
        return hash.toHex();
      }
      default: {
        if (!isHexString(blockTag)) {
          return logger.throwArgumentError(
            'blocktag should be a hex string',
            'blockTag',
            blockTag
          );
        }

        // block hash
        if (typeof blockTag === 'string' && isHexString(blockTag, 32)) {
          return blockTag;
        }

        const blockNumber = BigNumber.from(blockTag).toNumber();

        const hash = await this.api.rpc.chain.getBlockHash(blockNumber);

        return hash.toHex();
      }
    }
  }

  async queryAccountInfo(addressOrName, blockTag) {
    // pending tag
    const resolvedBlockTag = await blockTag;
    if (resolvedBlockTag === 'pending') {
      const address = await resolveEvmAddress(this, addressOrName);
      return this.api.query.evm.accounts(address);
    }

    const { address, blockHash } = await resolveProperties({
      address: resolveEvmAddress(this, addressOrName),
      blockHash: this._getBlockTag(blockTag)
    });

    const apiAt = await this.api.at(blockHash);

    const accountInfo = await apiAt.query.evm.accounts(address);

    return accountInfo;
  }

  async queryContractInfo(addressOrName, blockTag) {
    const accountInfo = await this.queryAccountInfo(addressOrName, blockTag);

    if (accountInfo.isNone) {
      return this.api.createType('Option<EvmContractInfo>', null);
    }

    return accountInfo.unwrap().contractInfo;
  }

  async getStorageAt(addressOrName, position, blockTag) {
    await this.resolveApi;

    const address = await resolveEvmAddress(this, addressOrName);
    const blockHash = await this._resolveBlockHash(blockTag);

    const code = blockHash
      ? await this.api.query.evm.accountStorages.at(blockHash, address)
      : await this.api.query.evm.accountStorages(address);

    return code.toHex();
  }

  async sendTransaction(signedTransaction) {
    return this._fail('sendTransaction');
  }

  async call(transaction, blockTag) {
    const resolved = await this._resolveTransaction(transaction);
    if (blockTag) {
      const blockHash = await this._resolveBlockHash(blockTag);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.api.rpc.evm).call(resolved, blockHash);
      return result.toHex();
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (this.api.rpc.evm).call({
        to: resolved.to,
        from: resolved.from,
        data: resolved.data,
        storageLimit: '0'
      });
      return result.toHex();
    }
  }

  async estimateGas(transaction) {
    const resources = await this.estimateResources(transaction);
    return resources.gas.add(resources.storage);
  }

  async estimateResources(transaction) {
    const resolved = await this._resolveTransaction(transaction);

    const from = await resolved.from;
    const value = await resolved.value;
    const to = await resolved.to;
    const data = await resolved.data;
    const storageLimit = await this._resolveStorageLimit(resolved);

    if (!from) {
      return logger.throwError('From cannot be undefined');
    }

    // construct extrinsic to estimate
    const extrinsic = !to
      ? this.api.tx.evm.create(
          data,
          toBN(value),
          toBN(await resolved.gasLimit),
          toBN(storageLimit)
        )
      : this.api.tx.evm.call(
          to,
          data,
          toBN(value),
          toBN(await resolved.gasLimit),
          toBN(storageLimit)
        );

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (this.api.rpc).evm.estimateResources(
      resolved.from,
      extrinsic.toHex() // returns transaction bytecode?
    );

    return {
      gas: BigNumber.from((result.gas).toString()),
      storage: BigNumber.from((result.storage).toString()),
      weightFee: BigNumber.from((result.weightFee).toString())
    };
  }

  async getBlock(blockHashOrBlockTag) {
    return this._fail('getBlock');
  }

  async getBlockWithTransactions(blockHashOrBlockTag) {
    return this._fail('getBlockWithTransactions');
  }

  async getTransaction(transactionHash) {
    return this._fail('getTransaction');
  }

  async getTransactionReceipt(txHash) {
    if (!this.dataProvider) return this._fail('getTransactionReceipt');
    return this.dataProvider.getTransactionReceipt(
      txHash,
      this._resolveBlockNumber
    );
  }

  async resolveName(name) {
    return name;
  }

  async lookupAddress(address) {
    return address;
  }

  async waitForTransaction(
    transactionHash,
    confirmations,
    timeout
  ) {
    return this._fail('waitForTransaction');
  }

  async getLogs(filter) {
    if (!this.dataProvider) return this._fail('getLogs');
    return this.dataProvider.getLogs(filter, this._resolveBlockNumber);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _fail(operation) {
    return Promise.resolve().then(() => {
      logger.throwError(`Unsupport ${operation}`);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(eventName, ...args) {
    return logger.throwError('Unsupport Event');
  }

  listenerCount(eventName) {
    return logger.throwError('Unsupport Event');
  }

  listeners(eventName) {
    return logger.throwError('Unsupport Event');
  }

  off(eventName, listener) {
    return logger.throwError('Unsupport Event');
  }

  on(eventName, listener) {
    return logger.throwError('Unsupport Event');
  }

  once(eventName, listener) {
    return logger.throwError('Unsupport Event');
  }

  removeAllListeners(eventName) {
    return logger.throwError('Unsupport Event');
  }

  addListener(eventName, listener) {
    return this.on(eventName, listener);
  }

  removeListener(eventName, listener) {
    return this.off(eventName, listener);
  }

  async _resolveTransactionReceipt(
    transactionHash,
    blockHash,
    from
  ) {
    const detail = await this.scanner.getBlockDetail({
      blockHash: blockHash
    });

    const blockNumber = detail.number;
    const extrinsic = detail.extrinsics.find(
      ({ hash }) => hash === transactionHash
    );

    if (!extrinsic) {
      return logger.throwError(`Transaction hash not found`);
    }

    const transactionIndex = extrinsic.index;

    const events = detail.events.filter(
      ({ phaseIndex }) => phaseIndex === transactionIndex
    );

    const findCreated = events.find(
      (x) =>
        x.section.toUpperCase() === 'EVM' &&
        x.method.toUpperCase() === 'CREATED'
    );

    const findExecuted = events.find(
      (x) =>
        x.section.toUpperCase() === 'EVM' &&
        x.method.toUpperCase() === 'EXECUTED'
    );

    const result = events.find(
      (x) =>
        x.section.toUpperCase() === 'SYSTEM' &&
        x.method.toUpperCase() === 'EXTRINSICSUCCESS'
    );

    if (!result) {
      return logger.throwError(`Can't find event`);
    }

    const status = findCreated || findExecuted ? 1 : 0;

    const contractAddress = findCreated ? findCreated.args[0] : null;

    const to = findExecuted ? findExecuted.args[0] : null;

    const logs = events
      .filter((e) => {
        return (
          e.method.toUpperCase() === 'LOG' && e.section.toUpperCase() === 'EVM'
        );
      })
      .map((log, index) => {
        return {
          transactionHash,
          blockNumber,
          blockHash,
          transactionIndex,
          removed: false,
          address: log.args[0].address,
          data: log.args[0].data,
          topics: log.args[0].topics,
          logIndex: index
        };
      });

    const gasUsed = BigNumber.from(result.args[0].weight);

    return {
      to,
      from,
      contractAddress,
      transactionIndex,
      gasUsed,
      logsBloom: '0x',
      blockHash,
      transactionHash,
      logs,
      blockNumber,
      confirmations: 4,
      cumulativeGasUsed: gasUsed,
      byzantium: false,
      status,
      effectiveGasPrice: BigNumber.from('1'),
      type: 0
    };
  }

  async _resolveBlockHash(
    blockTag
  ) {
    await this.resolveApi;

    if (!blockTag) return undefined;

    const resolvedBlockHash = await blockTag;

    if (resolvedBlockHash === 'pending') {
      throw new Error('Unsupport Block Pending');
    }

    if (resolvedBlockHash === 'latest') {
      const hash = await this.api.query.system.blockHash();
      return hash.toString();
    }

    if (resolvedBlockHash === 'earliest') {
      const hash = this.api.query.system.blockHash(0);
      return hash.toString();
    }

    if (isHex(resolvedBlockHash)) {
      return resolvedBlockHash;
    }

    const hash = await this.api.query.system.blockHash(resolvedBlockHash);

    return hash.toString();
  }

  async _resolveBlockNumber(
    blockTag
  ) {
    await this.resolveApi;

    if (!blockTag) {
      return logger.throwError(`Blocktag cannot be undefined`);
    }

    const resolvedBlockNumber = await blockTag;

    if (resolvedBlockNumber === 'pending') {
      throw new Error('Unsupport Block Pending');
    }

    if (resolvedBlockNumber === 'latest') {
      const header = await this.api.rpc.chain.getHeader();
      return header.number.toNumber();
    }

    if (resolvedBlockNumber === 'earliest') {
      return 0;
    }

    if (isNumber(resolvedBlockNumber)) {
      return resolvedBlockNumber;
    } else {
      throw new Error('Expect blockHash to be a number or tag');
    }
  }

  async _toAddress(addressOrName) {
    const resolved = await addressOrName;
    const address = encodeAddress(
      u8aFixLength(u8aConcat('evm:', hexToU8a(resolved)), 256, true)
    );
    return address.toString();
  }

  async _resolveTransaction(
    tx
  ) {
    for (const key of ['gasLimit', 'value']) {
      const typeKey = key;
      if (tx[typeKey]) {
        if (BigNumber.isBigNumber(tx[typeKey])) {
          tx[typeKey] = (tx[typeKey]).toHexString();
        } else if (isNumber(tx[typeKey])) {
          tx[typeKey] = numberToHex(tx[typeKey]);
        }
      }
    }

    delete tx.nonce;
    delete tx.gasPrice;
    delete tx.chainId;

    return tx;
  }

  async _resolveStorageLimit(
    tx
  ) {
    if (tx.customData) {
      if ('storageLimit' in tx.customData) {
        const storageLimit = tx.customData.storageLimit;
        if (BigNumber.isBigNumber(storageLimit)) {
          return storageLimit;
        } else if (isNumber(storageLimit)) {
          return BigNumber.from(storageLimit);
        }
      }
    }

    // At least 60 REEF are needed to deploy
    return BigNumber.from(60_000);
  }
}
