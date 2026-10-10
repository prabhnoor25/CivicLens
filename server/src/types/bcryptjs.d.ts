declare module "bcryptjs" {
  export function genSalt(rounds?: number): Promise<string>;
  export function hash(
    data: string,
    saltOrRounds: string | number,
  ): Promise<string>;
  export function compare(data: string, encrypted: string): Promise<boolean>;
  const bcrypt: {
    genSalt(rounds?: number): Promise<string>;
    hash(data: string, saltOrRounds: string | number): Promise<string>;
    compare(data: string, encrypted: string): Promise<boolean>;
  };
  export default bcrypt;
}
