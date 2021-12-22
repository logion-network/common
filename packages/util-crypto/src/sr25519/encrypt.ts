// Copyright 2017-2021 @polkadot/util-crypto authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { HexString } from '@polkadot/util/types';

import { assert, u8aConcat, u8aToU8a } from '@polkadot/util';

import { hmacSha256AsU8a } from '../hmac';
import { mnemonicGenerate, mnemonicToMiniSecret } from '../mnemonic';
import { naclEncrypt } from '../nacl';
import { pbkdf2Encode } from '../pbkdf2';
import { randomAsU8a } from '../random';
import { sr25519PairFromSeed } from './pair/fromSeed';
import { sr25519Agreement } from './agreement';

const encryptionKeySize = 32;
const macKeySize = 32;

/**
 * @name sr25519Encrypt
 * @description Returns encrypted message of `message`, using the supplied pair
 */
export function sr25519Encrypt (message: HexString | Uint8Array | string, publicKey: Uint8Array): Uint8Array {
  const { encryptedMessagePairPublicKey, encryptionKey, keyDerivationSalt, macKey } = generateNewEncryptionKey(publicKey);
  const { encrypted, nonce } = naclEncrypt(u8aToU8a(message), encryptionKey);
  const macValue = macData(nonce, encrypted, encryptedMessagePairPublicKey, macKey);

  return u8aConcat(nonce, keyDerivationSalt, encryptedMessagePairPublicKey, macValue, encrypted);
}

function generateNewEncryptionKey (receiverPublicKey: Uint8Array) {
  const encryptedMessagePair = sr25519PairFromSeed(mnemonicToMiniSecret(mnemonicGenerate()));
  const { encryptionKey, keyDerivationSalt, macKey } = buildSR25519EncryptionKey(receiverPublicKey, encryptedMessagePair.secretKey, encryptedMessagePair.publicKey);

  return {
    encryptedMessagePairPublicKey: encryptedMessagePair.publicKey,
    encryptionKey,
    keyDerivationSalt,
    macKey
  };
}

export function buildSR25519EncryptionKey (publicKey: Uint8Array, secretKey: Uint8Array, encryptedMessagePairPublicKey: Uint8Array, salt: Uint8Array = randomAsU8a()) {
  const agreementKey = sr25519Agreement(secretKey, publicKey);
  const masterSecret = u8aConcat(encryptedMessagePairPublicKey, agreementKey);

  return deriveKey(masterSecret, salt);
}

function deriveKey (masterSecret: Uint8Array, salt: Uint8Array) {
  const { password } = pbkdf2Encode(masterSecret, salt);

  assert(password.byteLength >= macKeySize + encryptionKeySize, 'Wrong derived key length');

  return {
    encryptionKey: password.slice(macKeySize, macKeySize + encryptionKeySize),
    keyDerivationSalt: salt,
    macKey: password.slice(0, macKeySize)
  };
}

export function macData (nonce: Uint8Array, encryptedMessage: Uint8Array, encryptedMessagePairPublicKey: Uint8Array, macKey: Uint8Array): Uint8Array {
  return hmacSha256AsU8a(macKey, u8aConcat(nonce, encryptedMessagePairPublicKey, encryptedMessage));
}
