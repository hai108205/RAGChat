class ApiResponse<T = any> {
    statusCode: number;
    data: T;
    message: string;
    success: boolean;

    constructor(statusCode: number, data: T, message: string = "Success") {
        this.statusCode = statusCode;
        this.data = data;
        this.message = message;
        this.success = statusCode < 400;
    }

    get statuscode(): number {
        return this.statusCode;
    }

    set statuscode(value: number) {
        this.statusCode = value;
    }
}

export { ApiResponse };

