import { Command } from "commander";

export interface OptionBuilder {
    build(command: Command): Command;
}

export class CommandBuilder {
    public static command(name: string): CommandBuilder {
        return new CommandBuilder(new Command(name));
    }

    private command: Command;

    constructor(command: Command) {
        this.command = command;
    }

    addOption(builder: OptionBuilder): CommandBuilder {
        this.command = builder.build(this.command);
        return this;
    }

    setDescription(description: string): CommandBuilder {
        this.command.description(description);
        return this;
    }

    build(): Command {
        return this.command;
    }
}