CREATE TABLE `activity_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`moduleId` int NOT NULL,
	`userId` int,
	`action` varchar(128) NOT NULL,
	`status` enum('initiated','in_progress','completed','failed') NOT NULL,
	`details` json,
	`output` text,
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`completedAt` timestamp,
	`duration` int,
	CONSTRAINT `activity_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hardware_status` (
	`id` int AUTO_INCREMENT NOT NULL,
	`deviceType` enum('esp32_s3','raspberry_pi','rfid_module') NOT NULL,
	`status` enum('online','offline','error') NOT NULL DEFAULT 'offline',
	`cpuUsage` decimal(5,2),
	`memoryUsage` decimal(5,2),
	`temperature` decimal(5,2),
	`lastHeartbeat` timestamp,
	`metadata` json,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hardware_status_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `hid_payloads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`description` text,
	`payload` text NOT NULL,
	`keystrokes` json,
	`delayMs` int NOT NULL DEFAULT 100,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `hid_payloads_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lan_devices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ipAddress` varchar(45) NOT NULL,
	`macAddress` varchar(17),
	`hostname` varchar(255),
	`osType` varchar(64),
	`openPorts` json,
	`services` json,
	`discoveredAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `lan_devices_id` PRIMARY KEY(`id`),
	CONSTRAINT `lan_devices_ipAddress_unique` UNIQUE(`ipAddress`)
);
--> statement-breakpoint
CREATE TABLE `modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`type` enum('wifi','hid','rfid','lan','logging') NOT NULL,
	`status` enum('idle','running','paused','error') NOT NULL DEFAULT 'idle',
	`enabled` boolean NOT NULL DEFAULT true,
	`configuration` json,
	`lastExecuted` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `modules_id` PRIMARY KEY(`id`),
	CONSTRAINT `modules_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `rfid_tags` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tagId` varchar(64) NOT NULL,
	`tagType` varchar(64),
	`data` binary,
	`isCloned` boolean NOT NULL DEFAULT false,
	`clonedFrom` int,
	`discoveredAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `rfid_tags_id` PRIMARY KEY(`id`),
	CONSTRAINT `rfid_tags_tagId_unique` UNIQUE(`tagId`)
);
--> statement-breakpoint
CREATE TABLE `system_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`key` varchar(128) NOT NULL,
	`value` json,
	`description` text,
	`updatedBy` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `system_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `system_settings_key_unique` UNIQUE(`key`)
);
--> statement-breakpoint
CREATE TABLE `wifi_networks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ssid` varchar(255) NOT NULL,
	`bssid` varchar(17) NOT NULL,
	`channel` int,
	`signalStrength` int,
	`encryption` varchar(64),
	`lastDiscovered` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wifi_networks_id` PRIMARY KEY(`id`),
	CONSTRAINT `wifi_networks_bssid_unique` UNIQUE(`bssid`)
);
