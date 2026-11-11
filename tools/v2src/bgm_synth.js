      const nb=oc.createBuffer(1,Math.floor(sr*.3),sr); const nd=nb.getChannelData(0); for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
      const noise=(t,v,d,type,freq,q=1)=>{const s2=oc.createBufferSource(),f=oc.createBiquadFilter(),g=oc.createGain();s2.buffer=nb;f.type=type;f.frequency.value=freq;f.Q.value=q;
        g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);s2.connect(f);f.connect(g);g.connect(out);s2.start(t);s2.stop(t+d+.02);};
      // 大鼓：頻率從 150Hz 快速掉到 45Hz，像在打拍子的心跳
      const kick=(t,v)=>{const o=oc.createOscillator(),g=oc.createGain();o.frequency.setValueAtTime(150,t);o.frequency.exponentialRampToValueAtTime(45,t+.12);
        g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+.28);o.connect(g);g.connect(out);o.start(t);o.stop(t+.3);};
      const clap=(t,v)=>{ [0,.011,.022].forEach(o=>noise(t+o,v,.1,"bandpass",1500,1.3)); };
      const hat=(t,v)=>noise(t,v,.04,"highpass",7500);
      // 貝斯：鋸齒波過低通濾波，八分音符一直推，會有往前衝的感覺
      const bass=(f,t,v,d)=>{const o=oc.createOscillator(),fl=oc.createBiquadFilter(),g=oc.createGain();o.type="sawtooth";o.frequency.value=f;fl.type="lowpass";fl.frequency.value=520;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(fl);fl.connect(g);g.connect(out);o.start(t);o.stop(t+d+.02);};
      // 和弦：反拍短促的「鏘」，兩個方波微微走音疊起來比較亮
      const stab=(ch,t,v)=>{ ch.slice(1).forEach(m=>[-6,6].forEach(dt=>{const o=oc.createOscillator(),fl=oc.createBiquadFilter(),g=oc.createGain();o.type="square";o.frequency.value=N(m+12);o.detune.value=dt;
        fl.type="lowpass";fl.frequency.setValueAtTime(3200,t);fl.frequency.exponentialRampToValueAtTime(700,t+.16);
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.005);g.gain.exponentialRampToValueAtTime(.0001,t+.18);o.connect(fl);fl.connect(g);g.connect(out);o.start(t);o.stop(t+.2);})); };
      // 主旋律：三角波＋八度方波，像清亮的電子撥弦
      const lead=(f,t,v,d)=>{ [["triangle",1,v],["square",2,v*.18]].forEach(([ty,mul,vv])=>{const o=oc.createOscillator(),g=oc.createGain();o.type=ty;o.frequency.value=f*mul;
        g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(vv,t+.01);g.gain.setValueAtTime(vv*.8,t+Math.max(.02,d*.5));g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g);g.connect(out);o.start(t);o.stop(t+d+.03);}); };
      for(let st=0;st<128;st++){
        const t=st*S16, bar=Math.floor(st/16), x=st%16, ch=CH[bar];
        if(x%4===0) kick(t,.5);
        if(x===4||x===12) clap(t,.13);
        if(x%4===2) hat(t,.07); else if(x%2===1) hat(t,.025);
        if(x%2===0) bass(N(ch[0]+(x%4===2?12:0)),t,.16,S16*1.7);
        if(x%4===2) stab(ch,t,.018);
        if(x%2===0){const n=MEL[bar*8+x/2]; if(n){ let d=S16*2; let k=bar*8+x/2+1; while(k<(bar+1)*8 && !MEL[k]){ d+=S16*2; k++; } lead(N(n),t,.075,Math.min(d,.8)); }}
      }
      if(true){ const t=LOOP-S16*2; noise(t,.05,S16*2,"bandpass",4000,.7); }   // 每圈結尾一個小「刷」，接回開頭
