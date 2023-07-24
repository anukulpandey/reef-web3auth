import './App.css';
import { useState ,useEffect} from 'react';
import { Web3Auth } from "@web3auth/modal";
import { Keyring } from "@polkadot/api";
import { CHAIN_NAMESPACES } from "@web3auth/base";
import {u8aToHex} from "@polkadot/util";
import {wrapBytes} from '@reef-defi/extension-dapp';
import { decodeAddress, signatureVerify } from '@reef-defi/util-crypto';
import {getProvider} from './utils';

const clientId = "BJJcvvvZaGzrWK90JRN2dSQ3g67rMGIn6hh9sWDIg7SVvo6se_1JD1k8_86VshiIu1dllrcj5Pr3wYDO10lFoB0";


function App() {
  const [web3auth, setWeb3auth] = useState(null);
  const [keyPair, setKeyPair] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        const web3auth = new Web3Auth({
          clientId,
          web3AuthNetwork: "cyan",
          chainConfig: {
            chainNamespace: CHAIN_NAMESPACES.OTHER,
            chainId: "0x3673",
            rpcTarget: "wss://rpc.reefscan.com/ws",
          },
        });


        setWeb3auth(web3auth);

        await web3auth.initModal();
        const web3authProvider = web3auth.connect();
        console.log(web3authProvider)

        console.log("initialized")
      } catch (error) {
        console.error(error);
      }
    };

    init();
  }, []);

  const getUserInfo = async () => {
    if (web3auth.status!=="connected") {
      console.log("web3auth not initialized yet");
      alert("Web3 auth not initialized , you need to login first")
      return;
    }
    const user = await web3auth.getUserInfo();
    console.log(user);
    alert(`
    name : ${user.name}
    email : ${user.email} 
    `)
  };

  const evenIdk = async ()=>{
    const privateKey = await web3auth.provider.request({ method: "private_key" })
const keyring = new Keyring({ ss58Format: 42,type: "sr25519" });
const _keyPair = keyring.addFromUri("0x" + String(privateKey));
const account = _keyPair?.address;
setKeyPair(keyPair);
alert(account)
  }

  const isValidSignature = (signedMessage, signature, address) => {
    const publicKey = decodeAddress(address);
    const hexPublicKey = u8aToHex(publicKey);
  
    return signatureVerify(signedMessage, signature, hexPublicKey).isValid;
  };

  const signRaw = async(message)=>{
    const privateKey = await web3auth.provider.request({ method: "private_key" })
    const keyring = new Keyring({ ss58Format: 42,type: "sr25519" });
    const _keyPair = keyring.addFromUri("0x" + String(privateKey));
   const signature= u8aToHex(_keyPair.sign(wrapBytes(message)))
   const _isValid = await isValidSignature(message,signature,_keyPair.address)
   alert(`signature: ${signature}\nverified: ${_isValid}`);

   return signature;
  }

  const createContractInstance = async()=>{
    const privateKey = await web3auth.provider.request({ method: "private_key" })
    const keyring = new Keyring({ ss58Format: 42,type: "sr25519" });
    const _keyPair = keyring.addFromUri("0x" + String(privateKey));
    const provider = await getProvider();
    const txHash = await provider.tx.balances
      .transfer("5EnY9eFwEDcEJ62dJWrTXhTucJ4pzGym4WZ2xcDKiT3eJecP", 12345)
      .signAndSend(_keyPair);
console.log(txHash.toHuman());
  }


  return (
    <div className="App">
      <header className="App-header">
       <h3>Minimal REEF web3auth dApp</h3>
    <br />
        <button onClick={getUserInfo} className="card">
            Get User Info
          </button>
          <br />
        <button onClick={evenIdk} className="card">
            Get Native Address
          </button>
          <br/>
        <button onClick={()=>signRaw("hello anukul")} className="card">
            Sign Raw
          </button>
          <br/>
        <button onClick={createContractInstance} className="card">
            Contract Instance
          </button>
          <br/>

     
      </header>
    </div>
  );
}

export default App;
