import { useState, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";

export const useBluetoothHeartRate = () => {
    const [heartRate, setHeartRate] = useState<number | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [isConnecting, setIsConnecting] = useState(false);
    const { toast } = useToast();
    const deviceRef = useRef<any>(null);

    const disconnect = useCallback(() => {
        if (deviceRef.current && deviceRef.current.gatt?.connected) {
            deviceRef.current.gatt.disconnect();
        }
        setIsConnected(false);
        setHeartRate(null);
    }, []);

    const connect = useCallback(async () => {
        const nav = navigator as any;
        if (!nav.bluetooth) {
            toast({
                title: "Não suportado",
                description: "Seu navegador não suporta Bluetooth Web. Use Chrome ou Edge.",
                variant: "destructive",
            });
            return;
        }

        try {
            setIsConnecting(true);

            const device = await nav.bluetooth.requestDevice({
                filters: [{ services: ["heart_rate"] }],
            });

            const server = await device.gatt?.connect();
            if (!server) throw new Error("Não foi possível conectar ao servidor GATT");

            const service = await server.getPrimaryService("heart_rate");
            const characteristic = await service.getCharacteristic("heart_rate_measurement");

            await characteristic.startNotifications();

            characteristic.addEventListener("characteristicvaluechanged", (event: any) => {
                const value = event.target.value;
                // O valor do batimento está no segundo byte (index 1) se o flag for 8-bit
                // Documentação Bluetooth: Heart Rate Measurement Characteristic
                const hrValue = value.getUint8(1);
                setHeartRate(hrValue);
            });

            deviceRef.current = device;
            setIsConnected(true);

            device.addEventListener("gattserverdisconnected", () => {
                setIsConnected(false);
                setHeartRate(null);
                toast({
                    title: "Desconectado",
                    description: "O sensor cardíaco foi desconectado.",
                });
            });

            toast({
                title: "Sensor Conectado",
                description: "Nexfit agora está recebendo dados reais do seu wearable.",
            });

        } catch (error: any) {
            console.error("Erro Bluetooth:", error);
            if (error.name !== "NotFoundError") {
                toast({
                    title: "Erro na conexão",
                    description: "Não foi possível parear o dispositivo Bluetooth.",
                    variant: "destructive",
                });
            }
        } finally {
            setIsConnecting(false);
        }
    }, [toast]);

    return { heartRate, isConnected, isConnecting, connect, disconnect };
};
