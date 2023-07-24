import "./App.css";
import { useState, useEffect } from "react";
import { Web3Auth } from "@web3auth/modal";
import { Keyring } from "@polkadot/api";
import { CHAIN_NAMESPACES } from "@web3auth/base";
import { u8aToHex } from "@polkadot/util";
import { wrapBytes } from "@reef-defi/extension-dapp";
import { decodeAddress, signatureVerify } from "@reef-defi/util-crypto";
import { getProvider } from "./utils";
import { utils, BigNumber } from "ethers";
import Uik from "@reef-defi/ui-kit";

const clientId =
  "BJJcvvvZaGzrWK90JRN2dSQ3g67rMGIn6hh9sWDIg7SVvo6se_1JD1k8_86VshiIu1dllrcj5Pr3wYDO10lFoB0";

function App() {
  const [web3auth, setWeb3auth] = useState(null);
  const [PrivateKey, setPrivateKey] = useState(null);
  const [user,setUser] = useState(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [balance,setBalance] = useState("fetching")

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
        web3auth.connect();
        const privateKey = await web3auth.provider.request({
          method: "private_key",
        });
        setPrivateKey(privateKey);
        
      } catch (error) {
        console.error(error);
      }
    };

    init();
  }, []);

  useEffect(() => {
    getUserInfo();
  }, [PrivateKey!=null])

  useEffect(() => {
    getNativeAddress();
  }, [user!=null])
  

  const getUserInfo = async () => {
    const user = await web3auth.getUserInfo();
    setUser(user);
  };

  const getNativeAddress = async () => {    
    const keyring = new Keyring({ ss58Format: 42, type: "sr25519" });
    const _keyPair = keyring.addFromUri("0x" + String(PrivateKey));
    let userData = user; 
    if(user!=null){
      userData['address'] = _keyPair?.address;
      setUser(userData);
      const provider = await getProvider();
      const data = await provider.query.system.account(_keyPair.address);
      setBalance(utils.formatUnits(BigNumber.from(data.data.free.toString())._hex, 18) +
      " REEF");
    }
  };

  const isValidSignature = (signedMessage, signature, address) => {
    const publicKey = decodeAddress(address);
    const hexPublicKey = u8aToHex(publicKey);

    return signatureVerify(signedMessage, signature, hexPublicKey).isValid;
  };

  const signRaw = async (message) => {
    const privateKey = await web3auth.provider.request({
      method: "private_key",
    });
    const keyring = new Keyring({ ss58Format: 42, type: "sr25519" });
    const _keyPair = keyring.addFromUri("0x" + String(privateKey));
    const signature = u8aToHex(_keyPair.sign(wrapBytes(message)));
    const _isValid = await isValidSignature(
      message,
      signature,
      _keyPair.address
    );
    alert(`signature: ${signature}\nverified: ${_isValid}`);

    return signature;
  };

  const makeTransaction = async () => {
    const privateKey = await web3auth.provider.request({
      method: "private_key",
    });
    const keyring = new Keyring({ ss58Format: 42, type: "sr25519" });
    const _keyPair = keyring.addFromUri("0x" + String(privateKey));
    const provider = await getProvider();
    const txHash = await provider.tx.balances
      .transfer("5EnY9eFwEDcEJ62dJWrTXhTucJ4pzGym4WZ2xcDKiT3eJecP", 12345)
      .signAndSend(_keyPair);
    console.log(txHash.toHuman());
  };

  return (
    <div className="App">
      <header className="App-header">
        <Uik.ReefLogo />
        {user!=null?
        <div>
          <div className="usernameBtn">
            <div className="usernameElem">
              {balance!="fetching"?
                <Uik.Button text={balance.split('.')[0]+' REEF'}/>:
              <Uik.Button text='Button' loading size='small' loader='fish'/>
            }
            </div>
          <Uik.Button text={user.name} rounded fill onClick={()=>setIsAccountModalOpen(true)} size='large'/>
          </div>
        <button onClick={() => signRaw("hello anukul")} className="card">
          Sign Raw
        </button>
        <br />
        <button onClick={makeTransaction} className="card">
          Make transaction
        </button>
        <br />
        <Uik.Modal
    title='Account Info'
    isOpen={isAccountModalOpen}
    onClose={() => setIsAccountModalOpen(false)}
    onOpened={() => {}}
    onClosed={() => {}}
    footer={
      <>
        <Uik.Button text='Close' onClick={() => setIsAccountModalOpen(false)}/>
      </>
    }
  >
    <div>
    <Uik.Avatar
    name={user.name}
    image={user.profileImage}
    size="large"
    className="accountInfoContent"
  />
    <Uik.Text className="accountInfoContent">Email: {user.email} </Uik.Text>
    <Uik.Text className="accountInfoContent">Address: {user.address} </Uik.Text>
    <Uik.Text className="accountInfoContent">Balance: {balance} </Uik.Text>
    <Uik.Text className="accountInfoContent">Verified Using: {user.verifier} </Uik.Text>
    <Uik.Text className="accountInfoContent">Logged in Using: {user.typeOfLogin} </Uik.Text>
    </div>
  </Uik.Modal>
        </div>
        :<div>You need to login to see this page</div>}
      </header>
    </div>
  );
}

export default App;
