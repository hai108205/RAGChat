#!/bin/bash

set -e

PROJECT_NAME="rocketchat-bot"

echo "Creating project: $PROJECT_NAME"

mkdir -p "$PROJECT_NAME"/{
src/{commands,events,handlers,services,repositories,settings,utils,constants,interfaces,lib},
tests/{commands,services,utils}
}

# src
touch "$PROJECT_NAME/src/App.ts"
touch "$PROJECT_NAME/src/index.ts"

# commands
touch "$PROJECT_NAME/src/commands/"{
PingCommand.ts,
HelpCommand.ts,
AiCommand.ts
}

# events
touch "$PROJECT_NAME/src/events/"{
MessageSent.ts,
RoomCreated.ts,
UserJoined.ts
}

# handlers
touch "$PROJECT_NAME/src/handlers/"{
MessageHandler.ts,
SlashCommandHandler.ts,
EventHandler.ts
}

# services
touch "$PROJECT_NAME/src/services/"{
AIService.ts,
UserService.ts,
RoomService.ts,
StorageService.ts,
HttpService.ts
}

# repositories
touch "$PROJECT_NAME/src/repositories/"{
UserRepository.ts,
ConfigRepository.ts
}

# settings
touch "$PROJECT_NAME/src/settings/"{
AppSettings.ts,
Settings.ts
}

# utils
touch "$PROJECT_NAME/src/utils/"{
Logger.ts,
Formatter.ts,
Validator.ts
}

# constants
touch "$PROJECT_NAME/src/constants/"{
Commands.ts,
Events.ts,
Errors.ts
}

# interfaces
touch "$PROJECT_NAME/src/interfaces/"{
IAIService.ts,
ICommand.ts,
IMessageHandler.ts
}

# lib
touch "$PROJECT_NAME/src/lib/RocketChat.ts"

# Root files
touch "$PROJECT_NAME"/{
app.json,
package.json,
tsconfig.json,
eslint.config.js,
.gitignore,
README.md
}

echo ""
echo "Project structure created successfully!"
echo ""

tree "$PROJECT_NAME" 2>/dev/null || find "$PROJECT_NAME"