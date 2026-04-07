/**
 * UART Communication Handler
 * 
 * Manages communication with ESP32-S3 via UART serial connection.
 * Handles message serialization, timeout management, and error recovery.
 * 
 * Protocol: JSON over Serial @ 9600 baud (8N1)
 * See UART_PROTOCOL.md for detailed specification
 */

import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';
import { nanoid } from 'nanoid';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// TYPES
// ============================================================================

export interface UARTMessage {
  id: string;
  cmd: string;
  params?: Record<string, any>;
}

export interface UARTResponse {
  id: string;
  result: Record<string, any> | null;
  error: string | null;
  timestamp: number;
}

interface PendingRequest {
  resolve: (value: UARTResponse) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const UART_PORT = process.env.UART_PORT || '/dev/ttyUSB0';
const UART_BAUDRATE = parseInt(process.env.UART_BAUDRATE || '9600');
const REQUEST_TIMEOUT = 30000;  // 30 seconds
const MAX_QUEUE_SIZE = 5;
const RECONNECT_DELAY = 5000;  // 5 seconds
const LOGS_DIR = path.join(process.cwd(), 'logs');

// ============================================================================
// UART HANDLER CLASS
// ============================================================================

export class UARTHandler extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private isConnected = false;
  private commandQueue: UARTMessage[] = [];
  private isProcessingQueue = false;
  private lastHeartbeat = Date.now();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;

  constructor() {
    super();
    this.ensureLogsDirectory();
  }

  /**
   * Initialize UART connection
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.port = new SerialPort({
        path: UART_PORT,
        baudRate: UART_BAUDRATE,
        autoOpen: false,
      });

      // Setup parser for line-based messages
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));

      // Handle port open
      this.port.on('open', () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        console.log(`✓ UART connected on ${UART_PORT} @ ${UART_BAUDRATE} baud`);
        this.emit('connected');
        resolve();
      });

      // Handle incoming messages
      this.parser.on('data', (data: string) => {
        this.handleMessage(data);
      });

      // Handle errors
      this.port.on('error', (err: Error) => {
        console.error('[UART Error]', err.message);
        this.isConnected = false;
        this.emit('error', err);
        this.attemptReconnect();
      });

      // Handle close
      this.port.on('close', () => {
        console.warn('[UART] Connection closed');
        this.isConnected = false;
        this.emit('disconnected');
        this.attemptReconnect();
      });

      // Open the port
      if (!this.port) {
        reject(new Error('Failed to create SerialPort instance'));
        return;
      }

      this.port.open((err: Error | null) => {
        if (err) {
          console.error('[UART] Failed to open port:', err.message);
          reject(err);
        }
      });

      // Start heartbeat monitor
      this.startHeartbeatMonitor();
    });
  }

  /**
   * Send command to ESP32 and wait for response
   */
  async sendCommand(cmd: string, params?: Record<string, any>): Promise<UARTResponse> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        reject(new Error('UART not connected'));
        return;
      }

      if (this.commandQueue.length >= MAX_QUEUE_SIZE) {
        reject(new Error('Command queue full, retry later'));
        return;
      }

      const message: UARTMessage = {
        id: nanoid(12),
        cmd,
        params,
      };

      // Setup timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error(`UART timeout: no response from ESP32 (${cmd})`));
      }, REQUEST_TIMEOUT);

      // Queue request
      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeout: timeoutHandle,
      });

      this.commandQueue.push(message);
      this.processQueue();
    });
  }

  /**
   * Process command queue (one at a time)
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.commandQueue.length === 0 || !this.isConnected) {
      return;
    }

    this.isProcessingQueue = true;
    const message = this.commandQueue.shift();

    if (message && this.port) {
      try {
        const jsonStr = JSON.stringify(message);
        this.port.write(jsonStr + '\n', (err) => {
          if (err) {
            console.error('[UART TX Error]', err);
            const pending = this.pendingRequests.get(message.id);
            if (pending) {
              clearTimeout(pending.timeout);
              pending.reject(err);
              this.pendingRequests.delete(message.id);
            }
          } else {
            this.logMessage('TX', message);
          }
        });

        // Give ESP32 time to process before next command
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('[UART] Send error:', error);
      }
    }

    this.isProcessingQueue = false;

    // Process next item in queue
    if (this.commandQueue.length > 0) {
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Handle incoming message from ESP32
   */
  private handleMessage(data: string): void {
    try {
      const trimmed = data.trim();
      if (!trimmed) return;

      const response: UARTResponse = JSON.parse(trimmed);
      this.logMessage('RX', response);

      // Heartbeat message
      if (response.id === 'heartbeat') {
        this.lastHeartbeat = Date.now();
        this.logToFile('heartbeat', response);
        return;
      }

      // Find matching request
      const pending = this.pendingRequests.get(response.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          pending.reject(new Error(response.error));
        } else {
          pending.resolve(response);
        }
      } else {
        console.warn(`[UART] Received response for unknown request: ${response.id}`);
      }
    } catch (error) {
      console.error('[UART Parse Error]', error);
      this.logToFile('error', { message: 'Failed to parse UART response', error: String(error) });
    }
  }

  /**
   * Heartbeat monitor - detect ESP32 disconnection
   */
  private startHeartbeatMonitor(): void {
    setInterval(() => {
      const secondsSinceLastBeat = (Date.now() - this.lastHeartbeat) / 1000;

      if (secondsSinceLastBeat > 120) {  // 2 minutes
        console.warn('[UART] No heartbeat from ESP32 for 2 minutes');
        this.emit('heartbeat_timeout');
        this.attemptReconnect();
      }
    }, 30000);  // Check every 30 seconds
  }

  /**
   * Attempt to reconnect on failure
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[UART] Max reconnection attempts reached');
      this.emit('reconnect_failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts - 1), 60000);

    console.log(`[UART] Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.close().then(() => this.initialize()).catch(err => {
        console.error('[UART] Reconnection failed:', err.message);
        this.attemptReconnect();
      });
    }, delay);
  }

  /**
   * Close UART connection
   */
  async close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.port && this.port.isOpen) {
        this.port.close(() => {
          this.isConnected = false;
          resolve();
        });
      } else {
        this.isConnected = false;
        resolve();
      }
    });
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.commandQueue.length;
  }

  /**
   * Get pending requests count
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  // ========================================================================
  // LOGGING
  // ========================================================================

  private ensureLogsDirectory(): void {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
  }

  private logMessage(direction: 'TX' | 'RX', data: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[UART ${direction}] ${JSON.stringify(data)}`);
  }

  private logToFile(type: string, data: any): void {
    try {
      const timestamp = new Date().toISOString();
      const logFile = path.join(LOGS_DIR, 'uart.log');
      const logEntry = `[${timestamp}] [${type}] ${JSON.stringify(data)}\n`;
      fs.appendFileSync(logFile, logEntry);
    } catch (error) {
      console.error('[UART] Failed to write log:', error);
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

let uartInstance: UARTHandler | null = null;

export async function initializeUART(): Promise<UARTHandler> {
  if (uartInstance) {
    return uartInstance;
  }

  uartInstance = new UARTHandler();
  await uartInstance.initialize();
  return uartInstance;
}

export function getUARTHandler(): UARTHandler {
  if (!uartInstance) {
    throw new Error('UART not initialized. Call initializeUART() first.');
  }
  return uartInstance;
}
