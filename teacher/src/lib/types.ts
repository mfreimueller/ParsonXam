export type Role = 'owner' | 'member';

export interface Member {
	teacherId: number;
	displayName: string;
	email: string;
	role: Role;
}

export interface ClassView {
	id: number;
	name: string;
	term: string;
	myRole: Role;
	members: Member[];
}
