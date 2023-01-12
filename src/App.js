import './App.css';
import { useState ,useEffect} from 'react';
import { Web3Auth } from "@web3auth/modal";
import { cryptoWaitReady } from "@reef-defi/util-crypto";
import { ApiPromise, WsProvider ,Keyring } from "@polkadot/api";
// import { Provider } from "@reef-defi/evm-provider";
import { options } from "@reef-defi/api";
import { CHAIN_NAMESPACES } from "@web3auth/base";

// const clientId = "BK7_IjVlLqpTGb046wIywX6GtFg7Zv4NndhoM_F140wx6DKYg3gsje8ntADoqSDKa8HZCVCAWdF53JNZT1AhPJE";
const clientId = "BJJcvvvZaGzrWK90JRN2dSQ3g67rMGIn6hh9sWDIg7SVvo6se_1JD1k8_86VshiIu1dllrcj5Pr3wYDO10lFoB0";


// const provider = new Provider(
//   options({
//     provider: new WsProvider("wss://rpc.reefscan.com/ws")
//   })
// );

function App() {
  const [web3auth, setWeb3auth] = useState(null);
  const [provider, setProvider] = useState(null);

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
    if (!web3auth) {
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

  const login = async () => {
    if (!web3auth) {
      console.log("web3auth not initialized yet");
      return;
    }
    console.log("i am here")
    const web3authProvider =await web3auth.connect(); 
    console.log("logged in")
    console.log(web3authProvider);

  };

  const evenIdk = async ()=>{
    const privateKey = await web3auth.provider.request({ method: "private_key" })
const keyring = new Keyring({ ss58Format: 42,type: "sr25519" });
console.log(keyring)
const keyPair = keyring.addFromUri("0x" + String(privateKey));

// keyPair.address is the account address.
const account = keyPair?.address;
console.log(account);

alert(account)


  }



  return (
    <div className="App">
      <header className="App-header">
       <h3>Minimal REEF web3auth dApp</h3>

      {/* <button onClick={login} className="card">
      Login
    </button> */}
    <br />
        <button onClick={getUserInfo} className="card">
            Get User Info
          </button>
          <br />
        <button onClick={evenIdk} className="card">
            Get Native Address
          </button>
     
      </header>
    </div>
  );
}

export default App;
