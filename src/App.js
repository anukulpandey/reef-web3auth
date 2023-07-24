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
import fromExponential from 'from-exponential';
import Uik from "@reef-defi/ui-kit";

const clientId =
  "BJJcvvvZaGzrWK90JRN2dSQ3g67rMGIn6hh9sWDIg7SVvo6se_1JD1k8_86VshiIu1dllrcj5Pr3wYDO10lFoB0";

function App() {
  const [web3auth, setWeb3auth] = useState(null);
  const [PrivateKey, setPrivateKey] = useState(null);
  const [user,setUser] = useState(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [balance,setBalance] = useState("fetching")
  const [destination,setDestination] = useState("");
  const [amount,setAmount] = useState(0);
  const [sendBtnVal,setSendBtnVal] = useState("Enter address");

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

  const logout = async () => {
    await web3auth.logout();
  };

  const makeTransaction = async () => {
    if(isValidAddress(destination) && isValidAmount(amount)){
      const privateKey = await web3auth.provider.request({
        method: "private_key",
      });
      const keyring = new Keyring({ ss58Format: 42, type: "sr25519" });
      const _keyPair = keyring.addFromUri("0x" + String(privateKey));
      const provider = await getProvider();
      const SINGLE_REEF = BigNumber.from("1000000000000000000");
      const TRANSFER_AMOUNT = SINGLE_REEF.mul(amount);
      const txHash = await provider.tx.balances
        .transfer(destination, TRANSFER_AMOUNT.toString())
        .signAndSend(_keyPair);
      Uik.notify.success(`Transaction Successful! Sent ${amount} to ${destination}`)
      Uik.notify.info(`Transaction hash : ${txHash.toHuman()}`)
    }else{
      Uik.notify.danger('Please enter details')
    }
  };

  const modal = ()=>{
    return <Uik.Modal
    title='Account Info'
    isOpen={isAccountModalOpen}
    onClose={() => setIsAccountModalOpen(false)}
    onOpened={() => {}}
    onClosed={() => {}}
    footer={
      <>
        <Uik.Button text='Logout' onClick={() => logout()}/>
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
  }

  const amountValidator = async(e)=>{
      if(e.target.value<=0){
        setSendBtnVal("Amount too less");
      }  else if(e.target.value>=balance-1){
        setSendBtnVal("Amount too high");
      }else{
        if(isValidAddress(destination)){
          setSendBtnVal("Send")
        }else{
          setSendBtnVal("Invalid Destination Address")
        }
      }
      setAmount(e.target.value)
  }

  const isValidAddress = (address)=>{
    if(address.length==48)return true;
    return false;
  }

  const isValidAmount=(amount)=>{
    if(amount<=0||amount>=balance-1)return false;
    return true;
  }

  const destinationValidator = async(e)=>{
      if(isValidAddress(e.target.value)){
        setSendBtnVal("Send")
      }else if(isValidAmount(amount)){
        setSendBtnVal("Invalid Amount");
      }else{
        setSendBtnVal("Invalid Address");
      }
      setDestination(e.target.value)
  }

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
          <div className="sendReefContainer">
          <Uik.Card title='Send Reef' titlePosition='center' className="sendReefContainerForm">
    <Uik.Input className="sendReefContainerFormDestination" placeholder="Destination" name={"destination"} onChange={destinationValidator}/>
    <Uik.Input className="sendReefContainerFormDestination" placeholder="Amount" type="number" name={"amount"} onChange={amountValidator}/>
    <div className="sendBtn">
      <button
      type="button"
      className="send-reef-btn"
      onClick={makeTransaction}
    >
      <Uik.Bubbles />
      <Uik.Text text={sendBtnVal} className="sendBtnText"/>
    </button>
    </div>
          </Uik.Card>
          </div>
        <button onClick={() => signRaw("hello anukul")} className="card">
          Sign Raw
        </button>
        <br />
        {modal()}
        </div>
        :<div>You need to login to see this page</div>}
      </header>
    </div>
  );
}

export default App;
