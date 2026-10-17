/** Política única de senhas para criação, recuperação e administração. */
export const SENHA_ABSOLUTA_MIN = 8;
export const SENHA_REQUISITOS = "Mínimo de 8 caracteres, uma letra maiúscula e um caractere especial";
export const senhaValida = (senha: string): boolean => senha.length >= SENHA_ABSOLUTA_MIN && /[A-Z]/.test(senha) && /[^A-Za-z0-9\s]/.test(senha);
