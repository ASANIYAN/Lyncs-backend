import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('clicks')
@Index(['short_code', 'clicked_at'])
export class Click {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ length: 10 })
  short_code: string;

  @CreateDateColumn()
  clicked_at: Date;

  @Column({ length: 45, nullable: true })
  ip_address: string;

  @Column('text', { nullable: true })
  user_agent: string;

  @Column('text', { nullable: true })
  referrer: string;

  @Column({ length: 2, nullable: true })
  country: string;
}
