import { scrypt, timingSafeEqual } from "node:crypto";
import { argon2id, hash, verify } from "argon2";

const keyLength = 64;

const deriveKey = (password: string, salt: Buffer) =>
  new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });

export const hashPassword = async (password: string) => {
  return hash(password, { type: argon2id });
};

export const verifyPassword = async (password: string, storedHash: string) => {
  if (storedHash.startsWith("$argon2")) {
    return verify(storedHash, password);
  }
  const [algorithm, saltHex, keyHex] = storedHash.split("$");
  if (
    algorithm !== "scrypt" ||
    !saltHex ||
    !keyHex ||
    !/^[a-f0-9]+$/i.test(saltHex) ||
    !/^[a-f0-9]+$/i.test(keyHex)
  ) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");
  if (salt.length !== 16 || expectedKey.length !== keyLength) {
    return false;
  }

  const actualKey = await deriveKey(password, salt);
  return timingSafeEqual(actualKey, expectedKey);
};

