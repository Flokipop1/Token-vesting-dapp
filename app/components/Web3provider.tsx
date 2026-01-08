"use client"; 

import { WagmiProvider, createConfig, http } from "wagmi";
import { bscTestnet } from "wagmi/chains";
import { ConnectKitProvider, getDefaultConfig } from "connectkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const config = createConfig(
  getDefaultConfig({
    chains: [bscTestnet],
    walletConnectProjectId: "YOUR_PROJECT_ID", 
    appName: "Trust Lock Vesting",
  })
);

const queryClient = new QueryClient();

export const Web3provider = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>{children}</ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};