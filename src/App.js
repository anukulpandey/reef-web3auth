import "./App.css";
import { useState, useEffect } from "react";
import { Web3Auth } from "@web3auth/modal";
import { Keyring } from "@polkadot/api";
import { CHAIN_NAMESPACES } from "@web3auth/base";
import { u8aToHex } from "@polkadot/util";
import { wrapBytes } from "@reef-defi/extension-dapp";
import { decodeAddress, signatureVerify } from "@reef-defi/util-crypto";
import { getProvider } from "./utils";
import { utils, BigNumber, ethers } from "ethers";
import Uik from "@reef-defi/ui-kit";
import { toUtf8Bytes } from "ethers/lib/utils";
import { cryptoWaitReady } from "@reef-defi/util-crypto";

const clientId =
  "BJJcvvvZaGzrWK90JRN2dSQ3g67rMGIn6hh9sWDIg7SVvo6se_1JD1k8_86VshiIu1dllrcj5Pr3wYDO10lFoB0";

function App() {
  const [web3auth, setWeb3auth] = useState(null);
  const [PrivateKey, setPrivateKey] = useState(null);
  const [user,setUser] = useState(null);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false)
  const [isSendReefModalOpen, setIsSendReefModalOpen] = useState(false)
  const [balance,setBalance] = useState("fetching")
  const [destination,setDestination] = useState("");
  const [amount,setAmount] = useState(0);
  const [sendBtnVal,setSendBtnVal] = useState("Enter native address");
  const [reefProvider, setReefProvider] = useState(null);
  const [nativeAddress,setNativeAddress] = useState(null);
  const [disperseArray,setDisperseArray] = useState(null);
  
  useEffect(() => {
    const init = async () => {
      try {
        await cryptoWaitReady();
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
        const res = await web3auth.connect();
        if(!web3auth.provider){
          reloadPage();
          await getNativeAddress()
        }
        const privateKey = await web3auth.provider.request({
          method: "private_key",
        });
        setPrivateKey(privateKey);
        const provider = await getProvider();
        setReefProvider(provider);
        
      } catch (error) {
        await cryptoWaitReady();
        console.error(error);
      }
    };

    init();
  }, []);
  useEffect(() => {
    getUserInfo();
  }, [PrivateKey])

  useEffect(() => {
    getNativeAddress();
  }, [nativeAddress])


  const getUserInfo = async () => {
    if(web3auth==null)return;
    const user = await web3auth.getUserInfo();
    setUser(user);
  };


  const getNativeAddress = async () => { 
    await cryptoWaitReady();   
    const _keyPair = await getReefKeypair();
    setNativeAddress(_keyPair?.address);
    let userData = user; 
    if(user!=null){
      userData['address'] = _keyPair?.address;
      setUser(userData);
      let provider;
      if(reefProvider==null){
        provider = await getProvider();
      }else{
        provider = reefProvider
      }
      const data = await provider.query.system.account(_keyPair.address);
      setBalance(utils.formatUnits(BigNumber.from(data.data.free.toString())._hex, 18) +
      " REEF");
    }
    return _keyPair?.address;
  };

  const isValidSignature = (signedMessage, signature, address) => {
    const publicKey = decodeAddress(address);
    const hexPublicKey = u8aToHex(publicKey);

    return signatureVerify(signedMessage, signature, hexPublicKey).isValid;
  };

  function createClaimEvmSignature(substrateAddress) {
    const publicKeySubstrate = decodeAddress(substrateAddress);
    let message =
      'reef evm:' + Buffer.from(publicKeySubstrate).toString('hex');
  
    if (typeof message === 'string') {
      message = toUtf8Bytes(message);
    }
  
    return message;
  }

  const bindEvm = async ()=>{
    Uik.notify.success("EVM Binding process started")
    const isBinded = await reefProvider.query.evmAccounts.evmAddresses(user.address);
    if(isBinded.isEmpty){
      try {
        const keyring = new Keyring({ type: 'sr25519' });
        const reefKey = keyring.addFromUri("0x"+PrivateKey);
        const ethKey = new ethers.Wallet(PrivateKey);
        console.log(ethKey.address);
    
        const msg = createClaimEvmSignature(reefKey.address);
        let signature = await ethKey.signMessage(msg);
        const res = await reefProvider.tx.evmAccounts.claimAccount(
          ethKey.address,
          signature
      ).signAndSend(reefKey);
      Uik.notify.success("Successfully claimed EVM address")
      } catch (error) {
        Uik.notify.danger("Encountered an error")
       console.log('err==',error); 
      }
    }else{
      Uik.notify.danger("EVM address already claimed")
    }
  }

  const getReefKeypair = async()=>{
    const privateKey = await web3auth.provider.request({
      method: "private_key",
    });
    const keyring = new Keyring({ ss58Format: 42, type: "sr25519" });
    const keypair = keyring.addFromUri("0x" + String(privateKey));
    return keypair;
  }

  const signRaw = async (message) => {
    const _keyPair = await getReefKeypair()
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
    console.log(user);
    reloadPage()
  };

  const makeTransaction = async () => {
    if(isValidAddress(destination) && isValidAmount(amount)){
      
      const _keyPair = await getReefKeypair();
      let provider;
      if(reefProvider==null){
        provider = await getProvider();
      }else{
        provider = reefProvider
      }
      
      const SINGLE_REEF = BigNumber.from("1000000000000000000");
      const TRANSFER_AMOUNT = SINGLE_REEF.mul(amount);
      const txHash = await provider.tx.balances
        .transfer(destination, TRANSFER_AMOUNT.toString())
        .signAndSend(_keyPair);
      Uik.notify.success(`Transaction Successful! Sent ${amount} to ${destination}`)
      Uik.notify.info(`Transaction hash : ${txHash.toHuman()}`)
      const data = await provider.query.system.account(_keyPair.address);
      setBalance(utils.formatUnits(BigNumber.from(data.data.free.toString())._hex, 18) +
      " REEF");
      Uik.dropConfetti()
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
  const sendReefModal = ()=>{
    return <Uik.Modal
    title='Send Reef'
    isOpen={isSendReefModalOpen}
    onClose={() => setIsSendReefModalOpen(false)}
    onOpened={() => {}}
    onClosed={() => {}}
  >
    <div>
    <Uik.Text text='Transfer Reef to a Native Address'/>
   {sendReefContainer()}
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
    if(address.length===48)return true;
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

  const sendReefContainer = ()=>{
    return <div className="sendReefContainer">
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
    </div>
  }

  const reloadPage = () => {
    window.location.reload();
  };

  const login =async ()=>{
    if(!web3auth)return;
    getProvider();
     await web3auth.connect()
     while(true){
        await getNativeAddress()
     }
  }

  function separateAddressAndAmount(inputStr){
    const separatedArr = inputStr.split(",");
    let address = separatedArr[0].split("[")[1];
    let amount = separatedArr[1].split("]")[0]
    if(isValidAddress(address)&&isValidAmount(amount)){
      return [address,amount]
    }else{
      if(!isValidAddress(address))Uik.notify.danger(`${address} is invalid`);
      else Uik.notify.danger(`${amount} is invalid`);
    }
    return [];
  }

  function parseInput(inputString) {
    const cleanedInput = inputString.replace(/\s+/g, '');
    const addressAmountPairs = cleanedInput.match(/\[.*?\]/g);
    let temp =[];
    let validAddressAndAmounts = [];
    for(let i=0;i<addressAmountPairs.length;i++){
      temp = separateAddressAndAmount(addressAmountPairs[i]);
      if(temp.length==2){
        validAddressAndAmounts.push(temp);
      }
    }
    return validAddressAndAmounts;
  }
  
  const disperseReefBatch =async (disperseReef)=>{
    const SINGLE_REEF = BigNumber.from("1000000000000000000");
    let transfers = []
    for(let i=0;i<disperseReef.length;i++){
      let TRANSFER_ADDRESS = disperseReef[i][0]
      let TRANSFER_AMOUNT = SINGLE_REEF.mul(parseInt(disperseReef[i][1]));
      let transfer = reefProvider.tx.balances.transfer(
        TRANSFER_ADDRESS,
        TRANSFER_AMOUNT.toString()
      );
      transfers.push(transfer);
    }
    const signer = await getReefKeypair();
    for(let i=0;i<transfers.length;i++){
    let hash = await transfers[i].signAndSend(signer);
    Uik.notify.success(`Successfully sent ${disperseReef[i][1]} to ${disperseReef[i][0]}`);
    Uik.notify.success(`Hash: ${hash.toHuman()}`);
    const data = await reefProvider.query.system.account(signer.address);
      setBalance(utils.formatUnits(BigNumber.from(data.data.free.toString())._hex, 18) +
      " REEF");

    }
  }

  const handleDisperse = async()=>{
try {
  const parsedInput = parseInput(disperseArray);
  await disperseReefBatch(parsedInput);
} catch (error) {
  console.log(error);
  Uik.notify.danger("Encountered an error");
}
  }

  return (
    <div className="App">
      <header className="App-header">
        <Uik.ReefLogo />
        {nativeAddress?
        <div>
          <div className="usernameBtn">
            <button className="textBtn" onClick={()=>window.open("https://discord.com/channels/793946260171259904/1087737503550816396","_blank")}>Get Reef</button>
            <button className="textBtn" onClick={bindEvm}>Bind EVM</button>
            <button className="textBtn" onClick={()=>setIsSendReefModalOpen(true)}>Send Reef</button>
            <div className="usernameElem">
              {balance!=="fetching"?
              <Uik.ReefAmount value={balance.split('.')[0]} />:
              <Uik.Button text='Button' loading size='small' loader='fish'/>
            }
            </div>
          <Uik.Button text={user.name} rounded fill onClick={()=>setIsAccountModalOpen(true)} size='large'/>
          </div>
          {sendReefModal()}
        {/* <button onClick={() => signRaw("hello anukul")} className="card">
          Sign Raw
        </button> */}
        <div className="disperse-body">
        <Uik.Text text='Disperse Reef Tokens' type='headline' className="headline-padding"/>
        <div className="disperse-container">
        <Uik.Card>
        <Uik.Input label='Enter Addresses & Amounts' placeholder={`{[5GQaLP6ap6JW4MbS22gVXLnUJxiVxCZzPA88cQfPSRZCYRNF,500],  [5EnY9eFwEDcEJ62dJWrTXhTucJ4pzGym4WZ2xcDKiT3eJecP,230],  [5FbG3RL7ftBhHm9eaZ3EDRVWJEFpF8ohct3JeohZdmiF8oDb,123]}`} rows={10} textarea onChange={e=>setDisperseArray(e.target.value)}/>
        <div className="sendBtn-disperse">
<button
type="button"
className="send-reef-btn-disperse"
onClick={handleDisperse}
>
  
<Uik.Bubbles />
<Uik.Text text={"Disperse Reef"} className="sendBtnText-disperse"/>

</button>
</div>
        </Uik.Card>
        </div>
        <footer>
      <div onClick={()=>window.open("https://github.com/reef-chain/web3auth","_blank")} className="github">
          <Uik.Avatar
    name={'reef-chain'}
    image={'/github.png'}
    size="small"
    className="accountInfoContent"
  />
          </div>
      </footer>
        </div>
        <br />
        {modal()}
        </div>
        : 
        <div className="not-loggedin-page">
          <Uik.Text text='Reef x Web3Auth Example' type='headline'/>
          <br/>
          <div className="text-containers">
          <Uik.Text text="NOTE: This DApp is specifically designed as an example of Web3auth's integration with Reef Chain"/>
          <br/>
          <Uik.Text text="In this example we have built a Reef Disperse App, which will streamline the process of dispersing Reef tokens to multiple addresses while ensuring reduced transaction fees compared to traditional methods." type="light"/>
          <br/>
          <Uik.Text text="To use this app you need to login by clicking the button below, you don't need to install the extension" type="light"/>
          <br/>
          {reefProvider || (web3auth && web3auth.status!="connected")?<Uik.Button text='Login' onClick={login} fill/>:<Uik.Button text='Initializing...' disabled/>}
      
    
          <br/>
          <div className="source-code-at">
          <Uik.Text text="Source code can be found at " type="light"/>
          <div onClick={()=>window.open("https://github.com/reef-chain/web3auth","_blank")}>
          <Uik.Avatar
    name={'reef-chain'}
    image={'/github.png'}
    size="small"
    className="accountInfoContent"
  />
          </div>
          </div>
          </div>
          
        </div>
          }
      </header>
    </div>
  );
}

export default App;
